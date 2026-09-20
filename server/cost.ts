import type { ModelUsage } from "../shared/types.ts";

/** $/1Mトークン。JEVは出力トークン無料 */
export const PRICING = {
  jev: { input: 0.042, output: 0 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
} as const;

export type PricedModel = keyof typeof PRICING;

export function priceOf(model: string): { input: number; output: number } {
  return PRICING[model as PricedModel] ?? PRICING["claude-opus-5"];
}

export function cost(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceOf(model);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function emptyUsage(): ModelUsage {
  return { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

export function addUsage(acc: ModelUsage, model: string, input: number, output: number): void {
  acc.requests += 1;
  acc.inputTokens += input;
  acc.outputTokens += output;
  acc.costUsd += cost(model, input, output);
}
