import { App } from "aws-cdk-lib";
import { JevTestStack } from "../lib/stack.ts";

const app = new App();

/**
 * Basic 認証の資格情報はテンプレートに残るので、デプロイのたびに context で渡す。
 *   npx cdk deploy -c basicAuthUser=xxx -c basicAuthPassword=yyy
 */
const basicAuthUser = app.node.tryGetContext("basicAuthUser");
const basicAuthPassword = app.node.tryGetContext("basicAuthPassword");

if (!basicAuthUser || !basicAuthPassword) {
  throw new Error(
    "Basic 認証の資格情報が未指定です。-c basicAuthUser=<id> -c basicAuthPassword=<pass> を付けて実行してください。"
  );
}

new JevTestStack(app, "JevTestStack", {
  env: { region: process.env.CDK_DEFAULT_REGION || "ap-northeast-1", account: process.env.CDK_DEFAULT_ACCOUNT },
  description: "MTG文字起こしから要求・要件を整理するツール (S3 + CloudFront + Lambda)",
  basicAuthUser,
  basicAuthPassword,
  bucketName: app.node.tryGetContext("bucketName"),
});
