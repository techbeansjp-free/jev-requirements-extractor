import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..", "..");

/** SSM Parameter Store に置くキーの接頭辞。値は SecureString で別途登録する */
const SSM_PREFIX = "/jev-test";

export type JevTestStackProps = StackProps & {
  basicAuthUser: string;
  basicAuthPassword: string;
  /** 省略すると CDK が一意な名前を自動生成する */
  bucketName?: string;
};

export class JevTestStack extends Stack {
  constructor(scope: Construct, id: string, props: JevTestStackProps) {
    super(scope, id, props);

    // ---- 静的フロント(S3。CloudFront からのみ読む) ----
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: props.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---- API(Lambda。APIキーを持つのはここだけ) ----
    const api = new NodejsFunction(this, "ApiFunction", {
      functionName: "jev-test-api",
      entry: join(appRoot, "server", "lambda.ts"),
      // ハンドラは infra/ の外(app/server/)にあるので、基準を app/ に寄せる
      projectRoot: appRoot,
      depsLockFilePath: join(appRoot, "package-lock.json"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      // 解析は要求件数に比例する。サンプル24発言で約30秒
      timeout: Duration.minutes(5),
      memorySize: 1024,
      environment: {
        SSM_PREFIX,
        CLAUDE_MODEL: "claude-opus-5",
        NODE_OPTIONS: "--enable-source-maps",
      },
      bundling: {
        // config.ts が import.meta.url を使うので ESM で出力する
        format: OutputFormat.ESM,
        target: "node24",
        minify: true,
        sourceMap: true,
        // AWS SDK v3 は Lambda ランタイムに同梱されている
        externalModules: ["@aws-sdk/*"],
      },
    });

    api.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter${SSM_PREFIX}/*`],
      })
    );

    const apiUrl = api.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      // 進捗を流しながら返すことで、CloudFront のオリジンタイムアウトに当たらない
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    // ---- Basic 認証(CloudFront Functions。viewer-request で弾く) ----
    const credentials = Buffer.from(`${props.basicAuthUser}:${props.basicAuthPassword}`).toString("base64");
    const basicAuth = new cloudfront.Function(this, "BasicAuthFunction", {
      functionName: "jev-test-basic-auth",
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: "Basic 認証。通過後に Authorization ヘッダーを落として OAC の署名と衝突させない",
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var auth = request.headers.authorization;
  if (!auth || auth.value !== 'Basic ${credentials}') {
    return {
      statusCode: 401,
      statusDescription: 'Unauthorized',
      headers: { 'www-authenticate': { value: 'Basic realm="jev-test"' } }
    };
  }
  // OAC が Authorization ヘッダーで署名するため、ビューアー側の値は必ず落とす
  delete request.headers.authorization;
  return request;
}
      `),
    });

    // ---- CloudFront ----
    const apiBehavior: cloudfront.BehaviorOptions = {
      origin: origins.FunctionUrlOrigin.withOriginAccessControl(apiUrl, {
        // ストリーミング中に切られないよう、読み取り側の猶予を最大まで取る
        readTimeout: Duration.seconds(60),
        keepaliveTimeout: Duration.seconds(60),
      }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      // Host を転送すると OAC の署名が壊れる
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      // 圧縮すると SSE がバッファされて進捗が届かない
      compress: false,
      functionAssociations: [{ function: basicAuth, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
    };

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "MTG文字起こし 要求・要件整理",
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [{ function: basicAuth, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: { "/api/*": apiBehavior },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      // カスタムエラーレスポンスは distribution 全体に効くため、/api/* のエラーまで
      // index.html に化けて原因が追えなくなる。単一ページなので SPA フォールバックは要らない
    });

    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset(join(appRoot, "dist"))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new CfnOutput(this, "Url", { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, "SsmPrefix", { value: SSM_PREFIX });
  }
}
