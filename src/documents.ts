import type { AnalysisResult, Requirement, Utterance } from "../shared/types.ts";
import {
  KIND_SECTION_LEAD,
  KIND_SECTION_TITLE,
  KIND_TABLE_LABEL,
  SPEC_PREFIX,
  SPEC_SECTION_TITLE,
  priorityLabel,
} from "./labels.ts";

export type DocumentId = "requirements" | "specifications" | "questions";

export type GeneratedDocument = {
  id: DocumentId;
  filename: string;
  label: string;
  /** 画面上でこの文書が何かを一言で説明する */
  summary: string;
  markdown: string;
};

/** 要求の区分ごとの並び順。困りごと → やりたいこと → 使い勝手 → 前提 */
const KIND_ORDER = ["issue", "functional", "nonfunctional", "constraint"] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 表のセルの中で改行やパイプが崩れないようにする */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function quotes(r: Requirement, byId: Map<number, Utterance>): string[] {
  return r.sourceIds
    .map((id) => byId.get(id))
    .filter((u): u is Utterance => Boolean(u))
    .map((u) => `> ${u.speaker}: ${u.text}`);
}

function groupByKind(requirements: Requirement[]): Array<[string, Requirement[]]> {
  return KIND_ORDER.map((kind) => [
    kind as string,
    requirements.filter((r) => r.judgement.kind.choice === kind),
  ]).filter(([, list]) => list.length > 0) as Array<[string, Requirement[]]>;
}

/** 要件に F-01 / N-01 / C-01 の通し番号を振る。元のIDも対応表として持っておく */
type NumberedSpec = {
  number: string;
  statement: string;
  kind: string;
  requirement: Requirement;
  originalId: string;
};

function numberSpecs(requirements: Requirement[]): NumberedSpec[] {
  const counters: Record<string, number> = {};
  const out: NumberedSpec[] = [];
  for (const kind of KIND_ORDER) {
    for (const r of requirements.filter((x) => x.judgement.kind.choice === kind)) {
      for (const s of r.specs) {
        const prefix = SPEC_PREFIX[kind] ?? "F";
        counters[prefix] = (counters[prefix] ?? 0) + 1;
        out.push({
          number: `${prefix}-${String(counters[prefix]).padStart(2, "0")}`,
          statement: s.statement,
          kind,
          requirement: r,
          originalId: s.id,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- 要求定義

function buildRequirementsDoc(result: AnalysisResult): string {
  const byId = new Map(result.utterances.map((u) => [u.id, u]));
  const out: string[] = [];

  out.push("# 要求定義");
  out.push("");
  out.push(`${formatDate(result.startedAt)}の打ち合わせで伺った内容を整理したものです。`);
  out.push("");
  out.push(
    "この資料は「今の業務で何に困っていて、どうなってほしいか」をまとめたものです。" +
      "それを実現するためにシステムが備える条件は、別紙「要件定義」にまとめています。"
  );
  out.push("");
  out.push("**この資料の読み方**");
  out.push("");
  out.push("- R01 などの番号は、要件定義・確認事項と照らし合わせるためのものです。");
  out.push("- 優先度は「それが無いと業務が回らないかどうか」を基準に分けています。");
  out.push("- 打ち合わせでの発言は、原文のまま引用しています。");
  out.push("- 打ち合わせの録音から自動で整理したものです。事実と違う点があればお知らせください。");
  out.push("");
  out.push("---");
  out.push("");

  out.push("## 1. 全体の一覧");
  out.push("");
  out.push("| 番号 | 内容 | 種類 | 優先度 |");
  out.push("| --- | --- | --- | --- |");
  for (const [kind, list] of groupByKind(result.requirements)) {
    for (const r of list) {
      out.push(
        `| ${r.id} | ${cell(r.statement)} | ${KIND_TABLE_LABEL[kind]} | ${priorityLabel(
          r.judgement.priority.score
        )} |`
      );
    }
  }
  out.push("");

  let section = 1;
  for (const [kind, list] of groupByKind(result.requirements)) {
    section += 1;
    out.push(`## ${section}. ${KIND_SECTION_TITLE[kind]}`);
    out.push("");
    out.push(KIND_SECTION_LEAD[kind]);
    out.push("");

    for (const r of list) {
      out.push(`### ${r.id} ${r.statement}`);
      out.push("");
      const meta = [`優先度: ${priorityLabel(r.judgement.priority.score)}`, `お話しいただいた方: ${r.speaker}`];
      if (r.judgement.settled.noul >= 0.5) meta.push("この場で進め方まで確認済み");
      out.push(meta.join(" / "));
      out.push("");
      if (r.background) {
        out.push(r.background);
        out.push("");
      }
      const lines = quotes(r, byId);
      if (lines.length > 0) {
        out.push("打ち合わせでの発言:");
        out.push("");
        out.push(lines.join("\n>\n"));
        out.push("");
      }
    }
  }

  return out.join("\n");
}

// ---------------------------------------------------------------- 要件定義

function buildSpecificationsDoc(result: AnalysisResult): string {
  const specs = numberSpecs(result.requirements);
  const out: string[] = [];

  out.push("# 要件定義");
  out.push("");
  out.push("別紙「要求定義」で整理したご要望を、システムが備えるべき条件として書き下したものです。");
  out.push("");
  out.push("**この資料の読み方**");
  out.push("");
  out.push("- 各項目は「〜できること」という形で書いています。完成したときに、この通りになっているかを確認します。");
  out.push("- 「対応するご要望」は要求定義の番号です。どのご要望に応えるための項目かを示しています。");
  out.push("- **ここに書かれていない動作は作られません。** 抜けている点があればお知らせください。");
  out.push("");
  out.push("---");
  out.push("");

  if (specs.length === 0) {
    out.push("条件として書き下せる項目がまだありません。別紙「確認事項」をご確認ください。");
    return out.join("\n");
  }

  out.push("## 1. 全体の一覧");
  out.push("");
  out.push("| 番号 | 内容 | 対応するご要望 | 優先度 |");
  out.push("| --- | --- | --- | --- |");
  for (const s of specs) {
    out.push(
      `| ${s.number} | ${cell(s.statement)} | ${s.requirement.id} | ${priorityLabel(
        s.requirement.judgement.priority.score
      )} |`
    );
  }
  out.push("");

  let section = 1;
  for (const kind of KIND_ORDER) {
    const list = specs.filter((s) => s.kind === kind);
    if (list.length === 0) continue;
    section += 1;
    out.push(`## ${section}. ${SPEC_SECTION_TITLE[kind] ?? KIND_SECTION_TITLE[kind]}`);
    out.push("");
    for (const s of list) {
      out.push(`### ${s.number} ${s.statement}`);
      out.push("");
      out.push(`対応するご要望: ${s.requirement.id} ${s.requirement.statement}`);
      out.push("");
      out.push(`優先度: ${priorityLabel(s.requirement.judgement.priority.score)}`);
      out.push("");
    }
  }

  const undone = result.requirements.filter((r) => r.specs.length === 0);
  if (undone.length > 0) {
    section += 1;
    out.push(`## ${section}. まだ条件にできていないご要望`);
    out.push("");
    out.push(
      "次のご要望は、どう実現するかを決めるための情報がまだ足りないため、条件として書き下せていません。" +
        "次回の打ち合わせで伺いたい内容は、別紙「確認事項」にまとめています。"
    );
    out.push("");
    for (const r of undone) {
      const why =
        r.judgement.kind.choice === "issue"
          ? "困っている内容は伺えましたが、何をもって解決とするかがまだ決まっていません。"
          : "実現する範囲や条件を、もう少し伺う必要があります。";
      out.push(`- **${r.id} ${r.statement}**`);
      out.push(`  ${why}`);
    }
    out.push("");
  }

  return out.join("\n");
}

// ---------------------------------------------------------------- 確認事項

type FlagGroup = {
  key: string;
  heading: string;
  reference: string;
  severity: "high" | "medium";
  actions: string[];
  requirement: Requirement;
};

function groupFlags(result: AnalysisResult, specNumbers: Map<string, string>): FlagGroup[] {
  const groups = new Map<string, FlagGroup>();

  for (const f of result.flags) {
    const requirement = result.requirements.find((r) => r.id === f.requirementId);
    if (!requirement) continue;
    const spec = f.specId ? requirement.specs.find((s) => s.id === f.specId) : undefined;
    const key = f.specId ?? f.requirementId;

    const existing = groups.get(key);
    if (existing) {
      if (!existing.actions.includes(f.action)) existing.actions.push(f.action);
      if (f.severity === "high") existing.severity = "high";
      continue;
    }

    groups.set(key, {
      key,
      heading: spec ? spec.statement : requirement.statement,
      reference: spec
        ? `対象: 要件定義 ${specNumbers.get(spec.id) ?? spec.id}(もとのご要望: 要求定義 ${requirement.id})`
        : `対象: 要求定義 ${requirement.id}`,
      severity: f.severity,
      actions: [f.action],
      requirement,
    });
  }

  return [...groups.values()];
}

function buildQuestionsDoc(result: AnalysisResult): string {
  const byId = new Map(result.utterances.map((u) => [u.id, u]));
  const specNumbers = new Map(numberSpecs(result.requirements).map((s) => [s.originalId, s.number]));
  const groups = groupFlags(result, specNumbers);
  const urgent = groups.filter((g) => g.severity === "high");
  const later = groups.filter((g) => g.severity === "medium");

  const out: string[] = [];
  out.push("# 確認事項");
  out.push("");
  out.push(`${formatDate(result.startedAt)}の打ち合わせの内容を整理するなかで、確認させていただきたい点です。`);
  out.push("");

  if (groups.length === 0) {
    out.push("整理した内容について、現時点で確認が必要な点はありませんでした。");
    return out.join("\n");
  }

  out.push("**この資料の読み方**");
  out.push("");
  out.push("- 「先に決めたいこと」は、決まらないと設計を進められない項目です。");
  out.push("- 「進めながら確認したいこと」は、作業と並行して詰められる項目です。");
  out.push("- それぞれ、もとになった打ち合わせでの発言を添えています。");
  out.push("");
  out.push("---");
  out.push("");

  const renderGroup = (g: FlagGroup, index: string) => {
    out.push(`### ${index} ${g.heading}`);
    out.push("");
    out.push(g.reference);
    out.push("");
    out.push("**確認したいこと**");
    out.push("");
    for (const a of g.actions) out.push(`- ${a}`);
    out.push("");
    const lines = quotes(g.requirement, byId);
    if (lines.length > 0) {
      out.push("**もとになった発言**");
      out.push("");
      out.push(lines.join("\n>\n"));
      out.push("");
    }
  };

  let section = 0;
  if (urgent.length > 0) {
    section += 1;
    out.push(`## ${section}. 先に決めたいこと(${urgent.length}件)`);
    out.push("");
    urgent.forEach((g, i) => renderGroup(g, `${section}.${i + 1}`));
  }
  if (later.length > 0) {
    section += 1;
    out.push(`## ${section}. 進めながら確認したいこと(${later.length}件)`);
    out.push("");
    later.forEach((g, i) => renderGroup(g, `${section}.${i + 1}`));
  }

  return out.join("\n");
}

// ----------------------------------------------------------------

export function buildDocuments(result: AnalysisResult): GeneratedDocument[] {
  return [
    {
      id: "requirements",
      filename: "要求定義.md",
      label: "要求定義",
      summary: "打ち合わせで伺った「困っていること・こうしたいこと」",
      markdown: buildRequirementsDoc(result),
    },
    {
      id: "specifications",
      filename: "要件定義.md",
      label: "要件定義",
      summary: "ご要望を満たすためにシステムが備える条件",
      markdown: buildSpecificationsDoc(result),
    },
    {
      id: "questions",
      filename: "確認事項.md",
      label: "確認事項",
      summary: "次回までに確認・決定したい項目",
      markdown: buildQuestionsDoc(result),
    },
  ];
}
