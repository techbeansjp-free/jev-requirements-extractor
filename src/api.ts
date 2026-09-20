import type { AnalysisOptions, ProgressEvent } from "../shared/types.ts";

/**
 * 解析はステップが6つあり全体で30秒前後かかるので、SSEで進捗を流しながら受ける。
 * POSTなのでEventSourceは使えず、fetchのストリームを直接読む。
 */
/**
 * CloudFront の OAC は Lambda Function URL へのリクエストを SigV4 で署名する。
 * POST ではボディのハッシュが署名対象に含まれるため、ビューアー側が x-amz-content-sha256 を
 * 付けないと署名が成立せず、CloudFront が Lambda に到達する前に 403 を返す。
 * ローカルの Express では単に無視されるので、常に付けておく。
 */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function* runAnalysis(
  transcript: string,
  options: AnalysisOptions,
  signal: AbortSignal
): AsyncGenerator<ProgressEvent> {
  const body = JSON.stringify({ transcript, options });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // crypto.subtle は secure context でのみ使える。localhost と HTTPS では常に利用できる
  if (globalThis.crypto?.subtle) {
    headers["x-amz-content-sha256"] = await sha256Hex(body);
  }

  const res = await fetch("/api/analyze", { method: "POST", headers, body, signal });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `解析APIがエラーを返しました (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      yield JSON.parse(line.slice(6)) as ProgressEvent;
    }
  }
}

export type Health = { jev: boolean; claude: boolean; defaultModel: string };

export async function fetchHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("APIサーバーに接続できません");
  return res.json();
}
