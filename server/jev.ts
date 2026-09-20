import type { JevAnswer, JevUsage, ModelUsage } from "../shared/types.ts";
import { getSecret } from "./config.ts";
import { addUsage } from "./cost.ts";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

/**
 * JEVの制約は「1リクエスト64kトークン、state + 最長質問で32kまで」。
 * 日本語は実測で1文字あたり約1.2〜1.5トークンなので、安全側に倒して見積もる。
 */
const TOKENS_PER_CHAR = 1.5;
const REQUEST_OVERHEAD_TOKENS = 300;
const MAX_TOKENS_PER_REQUEST = 24_000;
const MAX_CONCURRENCY = 4;

export type JevQuestion =
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] };

export function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

function questionSize(q: JevQuestion): number {
  const criteria = Array.isArray(q.criteria) ? q.criteria.join("") : Object.values(q.criteria).join("");
  return estimateTokens(q.instructions + criteria);
}

/** 同時実行数を絞って順に流す。JEVは1分1200リクエストまで */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function post(body: unknown, attempt = 0): Promise<{ answers: Record<string, JevAnswer>; usage: JevUsage }> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${await getSecret("jev")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 3) throw new Error(`JEV ${res.status}: ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    return post(body, attempt + 1);
  }
  if (!res.ok) throw new Error(`JEV ${res.status}: ${await res.text()}`);
  return (await res.json()) as { answers: Record<string, JevAnswer>; usage: JevUsage };
}

/**
 * 同じ判断材料(state)に対する複数の質問をまとめて投げる。
 * 質問文はリクエストごとに繰り返されるため、1問ずつ投げるとトークンが跳ね上がる。
 * 実測では24問を1リクエストに束ねると、1問ずつ投げた場合の約1/3で済む。
 */
export async function ask(
  state: string,
  questions: Record<string, JevQuestion>,
  usage: ModelUsage
): Promise<Record<string, JevAnswer>> {
  const entries = Object.entries(questions);
  if (entries.length === 0) return {};

  const stateTokens = estimateTokens(state) + REQUEST_OVERHEAD_TOKENS;
  const budget = MAX_TOKENS_PER_REQUEST - stateTokens;
  if (budget <= 0) {
    throw new Error(
      `判断材料が大きすぎます(推定 ${stateTokens} トークン)。分割してから渡してください。`
    );
  }

  const batches: Array<Array<[string, JevQuestion]>> = [];
  let current: Array<[string, JevQuestion]> = [];
  let currentTokens = 0;
  for (const entry of entries) {
    const size = questionSize(entry[1]);
    if (current.length > 0 && currentTokens + size > budget) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(entry);
    currentTokens += size;
  }
  if (current.length > 0) batches.push(current);

  const responses = await mapWithLimit(batches, MAX_CONCURRENCY, (batch) =>
    post({ model: MODEL, state, questions: Object.fromEntries(batch) })
  );

  const answers: Record<string, JevAnswer> = {};
  for (const res of responses) {
    Object.assign(answers, res.answers);
    addUsage(usage, "jev", res.usage.input_tokens, res.usage.output_tokens);
  }
  return answers;
}

export const isNoul = (a: JevAnswer | undefined): a is Extract<JevAnswer, { type: "noul" }> =>
  a?.type === "noul";
export const isChoice = (a: JevAnswer | undefined): a is Extract<JevAnswer, { type: "choice" }> =>
  a?.type === "choice";
export const isScore = (a: JevAnswer | undefined): a is Extract<JevAnswer, { type: "score" }> =>
  a?.type === "score";
