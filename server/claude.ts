import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ModelUsage } from "../shared/types.ts";
import { getSecret } from "./config.ts";
import { addUsage } from "./cost.ts";

let client: Anthropic | null = null;
async function getClient(): Promise<Anthropic> {
  if (!client) client = new Anthropic({ apiKey: await getSecret("anthropic") });
  return client;
}

const ExtractedRequirements = z.object({
  requirements: z.array(
    z.object({
      statement: z.string(),
      background: z.string(),
      speaker: z.string(),
      source_ids: z.array(z.number()),
    })
  ),
});

const DerivedSpecs = z.object({
  specs: z.array(
    z.object({
      requirement_id: z.string(),
      statement: z.string(),
    })
  ),
});

export const ClaudeSchemas = { ExtractedRequirements, DerivedSpecs };

/**
 * 抽出・導出はいずれも判断の余地がある作業なので adaptive thinking を入れる。
 * effort は medium 固定。要求の拾い漏れは効いてくるが、high まで上げても
 * 抽出結果はほとんど変わらず、思考トークンだけが増える。
 */
export async function parseWith<T extends z.ZodType>(
  schema: T,
  args: { model: string; system: string; user: string; maxTokens?: number },
  usage: ModelUsage
): Promise<z.infer<T>> {
  const res = await (await getClient()).messages.parse({
    model: args.model,
    max_tokens: args.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(schema), effort: "medium" },
    system: args.system,
    messages: [{ role: "user", content: args.user }],
  });

  addUsage(usage, args.model, res.usage.input_tokens, res.usage.output_tokens);

  if (!res.parsed_output) {
    throw new Error(`Claudeの出力をスキーマに沿って読み取れませんでした (stop_reason: ${res.stop_reason})`);
  }
  return res.parsed_output;
}
