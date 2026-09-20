import type { Writable } from "node:stream";
import type { AnalysisOptions } from "../shared/types.ts";
import { config, secretsStatus } from "./config.ts";
import { analyze } from "./pipeline.ts";

/**
 * Lambda の Node.js ランタイムが用意するグローバル。型は配布されていないので自前で宣言する。
 * 解析は30秒前後かかるため、レスポンスをストリーミングして進捗を先に返す。
 * 最初のイベントをすぐ流すので、CloudFront のオリジンタイムアウトにも当たらない。
 */
declare global {
  namespace awslambda {
    function streamifyResponse(
      handler: (event: FunctionUrlEvent, responseStream: Writable, context: unknown) => Promise<void>
    ): Handler;
    namespace HttpResponseStream {
      function from(
        stream: Writable,
        metadata: { statusCode: number; headers?: Record<string, string> }
      ): Writable;
    }
  }
}

type Handler = (event: unknown, context: unknown) => Promise<unknown>;

type FunctionUrlEvent = {
  rawPath?: string;
  requestContext: { http: { method: string; path: string } };
  body?: string;
  isBase64Encoded?: boolean;
};

function readBody(event: FunctionUrlEvent): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function open(stream: Writable, statusCode: number, contentType: string): Writable {
  return awslambda.HttpResponseStream.from(stream, {
    statusCode,
    headers: { "content-type": contentType, "cache-control": "no-cache, no-transform" },
  });
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  const path = event.rawPath ?? event.requestContext.http.path ?? "";
  const method = event.requestContext.http.method;

  if (method === "GET" && path.endsWith("/api/health")) {
    const out = open(responseStream, 200, "application/json; charset=utf-8");
    const status = await secretsStatus();
    out.write(JSON.stringify({ ...status, defaultModel: config.defaultModel }));
    out.end();
    return;
  }

  if (method !== "POST" || !path.endsWith("/api/analyze")) {
    const out = open(responseStream, 404, "application/json; charset=utf-8");
    out.write(JSON.stringify({ error: "Not Found" }));
    out.end();
    return;
  }

  const { transcript, options } = readBody(event) as {
    transcript?: string;
    options?: Partial<AnalysisOptions>;
  };

  if (!transcript?.trim()) {
    const out = open(responseStream, 400, "application/json; charset=utf-8");
    out.write(JSON.stringify({ error: "文字起こしが空です。" }));
    out.end();
    return;
  }

  const resolved: AnalysisOptions = {
    prescreen: options?.prescreen ?? true,
    prescreenThreshold: options?.prescreenThreshold ?? 0.2,
    deriveSpecs: options?.deriveSpecs ?? true,
    model: options?.model || config.defaultModel,
  };

  const out = open(responseStream, 200, "text/event-stream; charset=utf-8");
  const send = (data: unknown) => out.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: "step", step: "parse", status: "start" });

  try {
    for await (const ev of analyze(transcript, resolved)) {
      send(ev);
    }
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    out.end();
  }
});
