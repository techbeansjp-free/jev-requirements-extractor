import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");

export const config = {
  apiPort: Number(process.env.API_PORT || 3821),
  defaultModel: process.env.CLAUDE_MODEL || "claude-opus-5",
  /** Lambda ではここにキーを置く。未設定ならローカル実行とみなす */
  ssmPrefix: process.env.SSM_PREFIX,
  appRoot,
};

type Secret = { envName: string; ssmName: string; file: string };

const SECRETS = {
  jev: { envName: "JEV_API_KEY", ssmName: "JEV_API_KEY", file: "jev.txt" },
  anthropic: { envName: "ANTHROPIC_API_KEY", ssmName: "ANTHROPIC_API_KEY", file: "claude.txt" },
} satisfies Record<string, Secret>;

export type SecretName = keyof typeof SECRETS;

const cache = new Map<SecretName, string>();
let ssm: SSMClient | null = null;

/**
 * キーの解決順は 環境変数 → SSM Parameter Store → リポジトリ外の .tokens/。
 * Lambda では SSM の SecureString から読むので、CloudFormation のテンプレートに値が残らない。
 * ローカルでは .tokens/ をそのまま使えるので、開発時に追加の設定が要らない。
 */
export async function getSecret(name: SecretName): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  const spec = SECRETS[name];
  const fromEnv = process.env[spec.envName]?.trim();
  if (fromEnv) {
    cache.set(name, fromEnv);
    return fromEnv;
  }

  if (config.ssmPrefix) {
    ssm ??= new SSMClient({});
    const res = await ssm.send(
      new GetParameterCommand({
        Name: `${config.ssmPrefix}/${spec.ssmName}`,
        WithDecryption: true,
      })
    );
    const value = res.Parameter?.Value?.trim();
    if (!value) throw new Error(`SSM パラメータ ${config.ssmPrefix}/${spec.ssmName} が空です`);
    cache.set(name, value);
    return value;
  }

  // リポジトリ直下と、その親の両方を見る。どちらも git 管理外
  for (const dir of [resolve(appRoot, ".tokens"), resolve(appRoot, "..", ".tokens")]) {
    try {
      const value = readFileSync(resolve(dir, spec.file), "utf8").trim();
      if (value) {
        cache.set(name, value);
        return value;
      }
    } catch {
      // 次の候補へ
    }
  }

  throw new Error(
    `${spec.envName} が未設定で、.tokens/${spec.file} も読めませんでした。環境変数を設定するか .tokens/${spec.file} を用意してください。`
  );
}

/** 画面のヘルスチェック用。キーが解決できるかだけを見る */
export async function secretsStatus(): Promise<{ jev: boolean; claude: boolean }> {
  const check = async (name: SecretName) => {
    try {
      await getSecret(name);
      return true;
    } catch {
      return false;
    }
  };
  const [jev, claude] = await Promise.all([check("jev"), check("anthropic")]);
  return { jev, claude };
}
