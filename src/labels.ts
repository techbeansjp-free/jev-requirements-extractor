import type { Requirement } from "../shared/types.ts";

/** 画面の詳細表示用。区分を短く示す */
export const KIND_LABELS: Record<string, string> = {
  functional: "機能",
  nonfunctional: "非機能",
  constraint: "制約",
  issue: "課題",
};

/**
 * 成果物の文書用。読み手が非エンジニアなので、「機能要件」「非機能要件」のような
 * 業界用語を使わず、何の話かがそのまま伝わる言い方にする。
 */
export const KIND_SECTION_TITLE: Record<string, string> = {
  issue: "現在困っていること",
  functional: "システムで実現したいこと",
  nonfunctional: "性能や使い勝手についてのご要望",
  constraint: "予算・期日などの前提",
};

export const KIND_SECTION_LEAD: Record<string, string> = {
  issue: "システム化を考えるきっかけになった、現在の業務上の困りごとです。",
  functional: "システムで新しくできるようにしたいことです。",
  nonfunctional: "速さ・使える範囲・誰が何を見られるかなど、使い勝手に関わるご要望です。",
  constraint: "進め方を決めるうえで前提になる、予算や期日などの条件です。",
};

export const KIND_TABLE_LABEL: Record<string, string> = {
  issue: "困っていること",
  functional: "やりたいこと",
  nonfunctional: "使い勝手・性能",
  constraint: "前提条件",
};

/** 要件定義の章立て。要求の区分をそのまま引き継ぐ */
export const SPEC_SECTION_TITLE: Record<string, string> = {
  functional: "システムで行うこと",
  nonfunctional: "性能や使い勝手の条件",
  constraint: "前提として守ること",
};

/** 要件の通し番号の接頭辞 */
export const SPEC_PREFIX: Record<string, string> = {
  functional: "F",
  nonfunctional: "N",
  constraint: "C",
};

export const STEP_LABELS: Record<string, { name: string; who: "jev" | "claude" | "local" }> = {
  parse: { name: "文字起こしを発言に分割", who: "local" },
  screen: { name: "要求の材料になる発言を選別", who: "jev" },
  extract: { name: "発言から要求を抽出", who: "claude" },
  judge: { name: "要求を5軸で判定", who: "jev" },
  derive: { name: "要求から要件案を導出", who: "claude" },
  inspect: { name: "要件案を4軸で品質判定", who: "jev" },
};

export const WHO_LABELS: Record<string, string> = { jev: "JEV", claude: "Claude", local: "ローカル" };

/** 0〜3のスコアを、要件定義の現場で使う言い方に寄せる */
export function priorityLabel(score: number): string {
  if (score >= 2.5) return "必須";
  if (score >= 1.5) return "初回に入れたい";
  if (score >= 0.5) return "後続フェーズ";
  return "参考";
}

export function priorityTone(score: number): string {
  if (score >= 2.5) return "tag-bad";
  if (score >= 1.5) return "tag-warn";
  return "tag-neutral";
}

export function specCount(r: Requirement): number {
  return r.specs.length;
}
