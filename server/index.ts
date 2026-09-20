import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AnalysisOptions } from "../shared/types.ts";
import { config, secretsStatus } from "./config.ts";
import { analyze } from "./pipeline.ts";

const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", async (_req, res) => {
  const status = await secretsStatus();
  res.json({ ...status, defaultModel: config.defaultModel });
});

app.post("/api/analyze", async (req, res) => {
  const { transcript, options } = req.body as { transcript?: string; options?: Partial<AnalysisOptions> };
  if (!transcript?.trim()) {
    res.status(400).json({ error: "文字起こしが空です。" });
    return;
  }

  const resolved: AnalysisOptions = {
    prescreen: options?.prescreen ?? true,
    prescreenThreshold: options?.prescreenThreshold ?? 0.2,
    deriveSpecs: options?.deriveSpecs ?? true,
    model: options?.model || config.defaultModel,
  };

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  // プロキシ越しでも最初のイベントが届くよう、開始時に一度流しておく
  send({ type: "step", step: "parse", status: "start" });

  try {
    for await (const event of analyze(transcript, resolved)) {
      send(event);
    }
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
});

const dist = resolve(config.appRoot, "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

app.listen(config.apiPort, () => {
  console.log(`[api] http://localhost:${config.apiPort}`);
});
