import type {
  AnalysisOptions,
  ProgressEvent,
  Requirement,
  ReviewFlag,
  ScreenResult,
  Spec,
  Utterance,
} from "../shared/types.ts";
import { ask, isChoice, isNoul, isScore } from "./jev.ts";
import { requirementQuestions, screeningQuestion, specQuestions } from "./questions.ts";
import { ClaudeSchemas, parseWith } from "./claude.ts";
import { DERIVE_SYSTEM, EXTRACT_SYSTEM, deriveUser, extractUser } from "./prompts.ts";
import { formatTranscript, formatUtterance, parseTranscript } from "./transcript.ts";
import { cost, emptyUsage } from "./cost.ts";

/** JEVのstateに一度に載せる発言数。state+質問が24kトークンを超えない範囲に収める */
const SCREEN_CHUNK = 40;
/** Claudeに一度に渡す文字起こしの長さ。長いMTGはここで分割して並列に抽出する */
const EXTRACT_CHUNK_CHARS = 4000;
/** 分割したチャンクの頭に付ける、文脈把握用の直前発言数 */
const CONTEXT_UTTERANCES = 3;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 文字数を見ながら発言を切る。発言の途中では切らない */
function chunkByChars(utterances: Utterance[], maxChars: number): Utterance[][] {
  const out: Utterance[][] = [];
  let current: Utterance[] = [];
  let size = 0;
  for (const u of utterances) {
    const len = formatUtterance(u).length;
    if (current.length > 0 && size + len > maxChars) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(u);
    size += len;
  }
  if (current.length > 0) out.push(current);
  return out;
}

export async function* analyze(raw: string, options: AnalysisOptions): AsyncGenerator<ProgressEvent> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const jevUsage = emptyUsage();
  const claudeUsage = emptyUsage();

  yield { type: "step", step: "parse", status: "start" };
  const utterances = parseTranscript(raw);
  if (utterances.length === 0) {
    yield { type: "error", message: "文字起こしから発言を読み取れませんでした。" };
    return;
  }
  yield { type: "step", step: "parse", status: "done", detail: `${utterances.length}件の発言` };

  // --- 前段スクリーニング: Claudeに渡す前にJEVで雑談を落とす ---
  let screen: ScreenResult[] = [];
  let forExtraction = utterances;
  if (options.prescreen) {
    yield { type: "step", step: "screen", status: "start" };
    screen = await screenUtterances(utterances, options.prescreenThreshold, jevUsage);
    const keptIds = new Set(screen.filter((s) => s.kept).map((s) => s.id));
    forExtraction = utterances.filter((u) => keptIds.has(u.id));
    yield {
      type: "step",
      step: "screen",
      status: "done",
      detail: `${forExtraction.length}/${utterances.length}件をClaudeへ`,
    };
  } else {
    screen = utterances.map((u) => ({ id: u.id, relevance: 1, kept: true }));
  }

  // --- 要求の抽出(生成はここだけ) ---
  yield { type: "step", step: "extract", status: "start" };
  const extracted = await extractRequirements(forExtraction, utterances, options.model, claudeUsage);
  if (extracted.length === 0) {
    yield { type: "error", message: "要求を1件も抽出できませんでした。文字起こしの内容を確認してください。" };
    return;
  }
  yield { type: "step", step: "extract", status: "done", detail: `${extracted.length}件の要求` };

  // --- 要求の多軸判定(JEV) ---
  yield { type: "step", step: "judge", status: "start" };
  const requirements = await judgeRequirements(extracted, utterances, jevUsage);
  yield { type: "step", step: "judge", status: "done", detail: `${requirements.length}件 × 5軸` };
  yield { type: "partial", result: { utterances, screen, requirements } };

  // --- 要件案の導出とその品質判定 ---
  if (options.deriveSpecs) {
    yield { type: "step", step: "derive", status: "start" };
    await deriveSpecs(requirements, utterances, options.model, claudeUsage);
    const specCount = requirements.reduce((a, r) => a + r.specs.length, 0);
    yield { type: "step", step: "derive", status: "done", detail: `${specCount}件の要件案` };

    yield { type: "step", step: "inspect", status: "start" };
    await inspectSpecs(requirements, jevUsage);
    yield { type: "step", step: "inspect", status: "done", detail: `${specCount}件 × 4軸` };
  }

  const flags = buildFlags(requirements);
  const keptChars = forExtraction.reduce((a, u) => a + u.text.length, 0);
  const allChars = utterances.reduce((a, u) => a + u.text.length, 0);

  yield {
    type: "done",
    result: {
      utterances,
      screen,
      requirements,
      flags,
      usage: {
        jev: jevUsage,
        claude: claudeUsage,
        totalUsd: jevUsage.costUsd + claudeUsage.costUsd,
        claudeOnlyUsd: estimateClaudeOnly(jevUsage, claudeUsage, options.model, keptChars, allChars),
        screenedOutRatio: allChars === 0 ? 0 : 1 - keptChars / allChars,
      },
      options,
      startedAt,
      elapsedMs: Date.now() - t0,
    },
  };
}

async function screenUtterances(
  utterances: Utterance[],
  threshold: number,
  usage: ReturnType<typeof emptyUsage>
): Promise<ScreenResult[]> {
  const results: ScreenResult[] = [];
  for (const group of chunk(utterances, SCREEN_CHUNK)) {
    const state = formatTranscript(group);
    const questions = Object.fromEntries(group.map((u) => [`u${u.id}`, screeningQuestion(u.id)]));
    const answers = await ask(state, questions, usage);
    for (const u of group) {
      const a = answers[`u${u.id}`];
      const relevance = isNoul(a) ? a.noul : 1;
      results.push({ id: u.id, relevance, kept: relevance >= threshold });
    }
  }
  return results;
}

type Extracted = { statement: string; background: string; speaker: string; source_ids: number[] };

async function extractRequirements(
  target: Utterance[],
  all: Utterance[],
  model: string,
  usage: ReturnType<typeof emptyUsage>
): Promise<Extracted[]> {
  const chunks = chunkByChars(target, EXTRACT_CHUNK_CHARS);
  const byId = new Map(all.map((u) => [u.id, u]));

  const results = await Promise.all(
    chunks.map(async (group) => {
      // チャンクの頭が話の途中から始まるので、直前の発言を文脈として添える
      const firstId = group[0].id;
      const context = all
        .filter((u) => u.id < firstId)
        .slice(-CONTEXT_UTTERANCES)
        .map(formatUtterance)
        .join("\n");
      const res = await parseWith(
        ClaudeSchemas.ExtractedRequirements,
        {
          model,
          system: EXTRACT_SYSTEM,
          user: extractUser(formatTranscript(group), context || null),
        },
        usage
      );
      return res.requirements;
    })
  );

  return results
    .flat()
    .map((r) => ({ ...r, source_ids: r.source_ids.filter((id) => byId.has(id)) }))
    .filter((r) => r.statement.trim().length > 0);
}

/**
 * 根拠の発言に前後のやりとりを足して返す。
 * 「その場で合意できたか」は要望そのものではなく直後の応答に現れるため、
 * 根拠の発言だけを判断材料にすると全件が未決と判定される(実測 0.12 → 0.67)。
 */
function conversationAround(sourceIds: number[], all: Utterance[]): string {
  if (sourceIds.length === 0) return "";
  const from = Math.min(...sourceIds) - CONTEXT_UTTERANCES;
  const to = Math.max(...sourceIds) + CONTEXT_UTTERANCES;
  return all
    .filter((u) => u.id >= from && u.id <= to)
    .map(formatUtterance)
    .join("\n");
}

async function judgeRequirements(
  extracted: Extracted[],
  all: Utterance[],
  usage: ReturnType<typeof emptyUsage>
): Promise<Requirement[]> {
  const requirements: Requirement[] = [];

  // 判定は要求ごとに判断材料(根拠の発言)が変わるため、stateも要求ごとに作る
  await Promise.all(
    extracted.map(async (r, index) => {
      const id = `R${String(index + 1).padStart(2, "0")}`;
      const state = [
        `【抽出された要求】\n${r.statement}`,
        r.background ? `【背景】\n${r.background}` : "",
        `【打ち合わせでのやりとり(この要求の根拠: 発言 ${r.source_ids.join(", ") || "なし"})】\n${
          conversationAround(r.source_ids, all) || "(該当なし)"
        }`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const answers = await ask(state, requirementQuestions(id), usage);
      const kind = answers[`${id}__kind`];
      const priority = answers[`${id}__priority`];
      const vagueness = answers[`${id}__vagueness`];
      const grounded = answers[`${id}__grounded`];
      const settled = answers[`${id}__settled`];
      if (!isChoice(kind) || !isScore(priority) || !isScore(vagueness) || !isNoul(grounded) || !isNoul(settled)) {
        throw new Error(`JEVの判定結果が想定した形式ではありません (${id})`);
      }

      requirements[index] = {
        id,
        statement: r.statement,
        background: r.background,
        speaker: r.speaker,
        sourceIds: r.source_ids,
        judgement: { kind, priority, vagueness, grounded, settled },
        specs: [],
      };
    })
  );

  // 優先度が高い順、同点なら発言順に並べる
  return requirements.sort(
    (a, b) =>
      b.judgement.priority.score - a.judgement.priority.score ||
      (a.sourceIds[0] ?? 0) - (b.sourceIds[0] ?? 0)
  );
}

async function deriveSpecs(
  requirements: Requirement[],
  all: Utterance[],
  model: string,
  usage: ReturnType<typeof emptyUsage>
): Promise<void> {
  const byId = new Map(all.map((u) => [u.id, u]));
  // 困りごとの表明にとどまる要求からは要件を起こせないので、対象から外す
  const targets = requirements.filter((r) => r.judgement.kind.choice !== "issue");
  if (targets.length === 0) return;

  const groups = chunk(targets, 8);
  const derived = await Promise.all(
    groups.map(async (group) => {
      const res = await parseWith(
        ClaudeSchemas.DerivedSpecs,
        {
          model,
          system: DERIVE_SYSTEM,
          user: deriveUser(
            group.map((r) => ({
              id: r.id,
              statement: r.statement,
              background: r.background,
              evidence: r.sourceIds
                .map((sid) => byId.get(sid))
                .filter((u): u is Utterance => Boolean(u))
                .map(formatUtterance)
                .join("\n"),
            }))
          ),
        },
        usage
      );
      return res.specs;
    })
  );

  const byRequirement = new Map(requirements.map((r) => [r.id, r]));
  const counters = new Map<string, number>();
  for (const s of derived.flat()) {
    const parent = byRequirement.get(s.requirement_id);
    if (!parent || !s.statement.trim()) continue;
    const n = (counters.get(parent.id) ?? 0) + 1;
    counters.set(parent.id, n);
    parent.specs.push({ id: `${parent.id}-S${n}`, statement: s.statement });
  }
}

async function inspectSpecs(requirements: Requirement[], usage: ReturnType<typeof emptyUsage>): Promise<void> {
  await Promise.all(
    requirements.flatMap((r) =>
      r.specs.map(async (s: Spec) => {
        const state = `【元の要求】\n${r.statement}\n\n【要求の背景】\n${r.background || "(記載なし)"}\n\n【判定対象の要件】\n${s.statement}`;
        const answers = await ask(state, specQuestions(s.id), usage);
        const verifiable = answers[`${s.id}__verifiable`];
        const vagueWords = answers[`${s.id}__vagueWords`];
        const covers = answers[`${s.id}__covers`];
        const atomic = answers[`${s.id}__atomic`];
        if (!isNoul(verifiable) || !isNoul(vagueWords) || !isNoul(covers) || !isNoul(atomic)) {
          throw new Error(`JEVの判定結果が想定した形式ではありません (${s.id})`);
        }
        s.quality = { verifiable, vagueWords, covers, atomic };
      })
    )
  );
}

/**
 * 人のレビューが要る項目を、JEVの確率から機械的に立てる。
 * 確信度が低いこと自体を「判断が割れている = 人が見るべき」として扱えるのが、
 * 生成モデルに同じ判定をさせた場合との一番の違いになる。
 */
function buildFlags(requirements: Requirement[]): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  const add = (f: ReviewFlag) => flags.push(f);

  for (const r of requirements) {
    const j = r.judgement;

    if (j.grounded.noul < 0.7) {
      add({
        requirementId: r.id,
        category: "grounding",
        severity: "high",
        reason: `文字起こしに根拠が見当たらない(根拠あり ${pct(j.grounded.noul)})。抽出時に条件が補われた可能性がある`,
        action:
          "打ち合わせでの発言から直接は読み取れない内容が含まれています。この理解で合っているか確認させてください。",
      });
    }
    if (j.vagueness.score >= 1.5) {
      add({
        requirementId: r.id,
        category: "vagueness",
        severity: j.vagueness.score >= 1.7 ? "high" : "medium",
        reason: `このままでは設計に渡せない(曖昧さ ${j.vagueness.score.toFixed(1)}/2)。追加ヒアリングが必要`,
        action:
          "ご要望の範囲や条件に幅があるため、このまま進めると認識のずれが出ます。対象や条件をもう少し具体的に伺いたいです。",
      });
    }
    if (j.kind.confidence < 0.6) {
      const top = Object.entries(j.kind.probabilities)
        .filter(([, p]) => p >= 0.15)
        .sort(([, a], [, b]) => b - a);
      add({
        requirementId: r.id,
        category: "classification",
        severity: "medium",
        reason: `要求の種類の判断が割れている(${top.map(([k, p]) => `${kindLabel(k)} ${pct(p)}`).join(" / ")})`,
        action: `${top
          .map(([k]) => PLAIN_KIND[k] ?? k)
          .join("と")}のどちらとして扱うかで、進め方が変わります。どちらで進めるか確認させてください。`,
      });
    }
    // 初回ヒアリングでは未決が普通なので、未決であること自体はカードのバッジで示す。
    // 優先度が高いのに決まっていないものだけ、次回までに詰める対象として挙げる。
    if (j.settled.noul < 0.4 && j.priority.score >= 2) {
      add({
        requirementId: r.id,
        category: "undecided",
        severity: "high",
        reason: `優先度が高いのに方針が固まっていない(優先度 ${j.priority.score.toFixed(1)}/3、合意済み ${pct(
          j.settled.noul
        )})。次回までに詰める`,
        action:
          "業務への影響が大きいご要望ですが、どう実現するかがまだ決まっていません。次回までに方針を決めたい項目です。",
      });
    }

    for (const s of r.specs) {
      const q = s.quality;
      if (!q) continue;
      if (q.covers.noul < 0.7) {
        add({
          requirementId: r.id,
          specId: s.id,
          category: "coverage",
          severity: "high",
          reason: `要件が要求を満たしきれていない(カバー ${pct(q.covers.noul)})`,
          action:
            "この内容だけでは、元のご要望を満たしきれていない可能性があります。足りない部分がないか確認させてください。",
        });
      }
      if (q.verifiable.noul < 0.7) {
        add({
          requirementId: r.id,
          specId: s.id,
          category: "verifiability",
          severity: "high",
          reason: `受け入れ条件に落とせない(検証可能 ${pct(q.verifiable.noul)})`,
          action:
            "完成したときに、この条件を満たしたかどうかを判断する基準が決まっていません。何をもって完了とするかを決めたい項目です。",
        });
      }
      if (q.vagueWords.noul >= 0.5) {
        add({
          requirementId: r.id,
          specId: s.id,
          category: "wording",
          severity: "medium",
          reason: `解釈が分かれる語が含まれる(曖昧語 ${pct(q.vagueWords.noul)})`,
          action:
            "人によって受け取り方が変わる表現が含まれています。具体的な数値や条件に置き換えたい箇所です。",
        });
      }
      if (q.atomic.noul < 0.7) {
        add({
          requirementId: r.id,
          specId: s.id,
          category: "atomicity",
          severity: "medium",
          reason: `複数の事項が1件に混ざっている(単一事項 ${pct(q.atomic.noul)})。分割を検討`,
          action: "1つの項目に複数のことが入っています。分けたほうが、完成時の確認がしやすくなります。",
        });
      }
    }
  }
  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const PLAIN_KIND: Record<string, string> = {
  functional: "システムで実現すること",
  nonfunctional: "性能や使い勝手の条件",
  constraint: "予算や期日などの前提",
  issue: "困りごとの共有",
};

export function kindLabel(kind: string): string {
  return { functional: "機能", nonfunctional: "非機能", constraint: "制約", issue: "課題" }[kind] ?? kind;
}

/**
 * JEVに任せた判定を全部Claudeにやらせた場合の推定コスト。
 * 判断材料の入力は同じだけ必要になり、加えて判定結果を出力トークンとして払う。
 * スクリーニングで落とした分も、Claudeに渡すなら入力として乗る。
 */
function estimateClaudeOnly(
  jevUsage: ReturnType<typeof emptyUsage>,
  claudeUsage: ReturnType<typeof emptyUsage>,
  model: string,
  keptChars: number,
  allChars: number
): number {
  // 判定1件あたりの出力トークン。根拠なしの素の判定でも15トークン前後になる
  const OUTPUT_TOKENS_PER_JUDGEMENT = 15;
  const judgementCount = Math.max(jevUsage.requests, 1) * 5;
  const judgementCost = cost(model, jevUsage.inputTokens, judgementCount * OUTPUT_TOKENS_PER_JUDGEMENT);

  // スクリーニングで落とした文字を抽出に回した場合の追加入力
  const skippedChars = Math.max(0, allChars - keptChars);
  const skippedCost = cost(model, Math.ceil(skippedChars * 1.5), 0);

  return claudeUsage.costUsd + judgementCost + skippedCost;
}
