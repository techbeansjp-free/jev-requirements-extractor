/** JEV(判定専用AI)のレスポンス型。3種類の質問タイプに対応する */
export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
};
export type JevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type JevUsage = { input_tokens: number; output_tokens: number };

/** 文字起こしを話者単位に分割したもの */
export type Utterance = { id: number; speaker: string; text: string };

/** 前段スクリーニング: この発言が要求の材料になるかのJEV判定 */
export type ScreenResult = { id: number; relevance: number; kept: boolean };

export type RequirementKind = "functional" | "nonfunctional" | "constraint" | "issue";

/** 要求 = 業務側が語った「こうしたい / こう困っている」 */
export type Requirement = {
  id: string;
  statement: string;
  background: string;
  speaker: string;
  sourceIds: number[];
  judgement: RequirementJudgement;
  specs: Spec[];
};

export type RequirementJudgement = {
  /** 機能要求か、非機能か、制約か、課題の表明にとどまるか */
  kind: ChoiceAnswer;
  /** 0:あれば程度 〜 3:これが無いと業務が回らない */
  priority: ScoreAnswer;
  /** 0:具体的 〜 2:曖昧で要ヒアリング */
  vagueness: ScoreAnswer;
  /** 文字起こしに根拠があるか(抽出側の作文を検出する) */
  grounded: NoulAnswer;
  /** その場で合意されたか、持ち帰り・未決か */
  settled: NoulAnswer;
};

/** 要件 = 要求を満たすためにシステムが備えるべき、検証可能な条件 */
export type Spec = {
  id: string;
  statement: string;
  /** 品質判定はinspect工程で埋まる。deriveSpecsのみ実行した時点では未設定 */
  quality?: SpecQuality;
};

export type SpecQuality = {
  /** 受け入れテストが書けるか */
  verifiable: NoulAnswer;
  /** 「適切に」「なるべく早く」のような曖昧語を含むか。高いほど問題 */
  vagueWords: NoulAnswer;
  /** 元の要求を過不足なくカバーしているか */
  covers: NoulAnswer;
  /** 1要件1事項に分かれているか */
  atomic: NoulAnswer;
};

export type FlagCategory =
  | "grounding"
  | "vagueness"
  | "classification"
  | "undecided"
  | "coverage"
  | "verifiability"
  | "wording"
  | "atomicity";

/** 人のレビューが要る項目。JEVの確信度から機械的に立てる */
export type ReviewFlag = {
  requirementId: string;
  specId?: string;
  category: FlagCategory;
  /** 画面の詳細表示用。判定の確率をそのまま含む */
  reason: string;
  /** 成果物の文書用。確率や専門用語を使わず、次に何を確認するかを書く */
  action: string;
  severity: "high" | "medium";
};

export type ModelUsage = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type UsageReport = {
  jev: ModelUsage;
  claude: ModelUsage;
  totalUsd: number;
  /** JEVを一切使わず、同じ判定をClaudeにやらせた場合の推定コスト */
  claudeOnlyUsd: number;
  screenedOutRatio: number;
};

export type AnalysisOptions = {
  /** 前段スクリーニング(JEVで雑談を落としてからClaudeへ渡す) */
  prescreen: boolean;
  /** スクリーニングの閾値。下回った発言をClaudeに渡さない */
  prescreenThreshold: number;
  /** 要件案の導出まで行うか */
  deriveSpecs: boolean;
  model: string;
};

export type AnalysisResult = {
  utterances: Utterance[];
  screen: ScreenResult[];
  requirements: Requirement[];
  flags: ReviewFlag[];
  usage: UsageReport;
  options: AnalysisOptions;
  startedAt: string;
  elapsedMs: number;
};

export type StepName = "parse" | "screen" | "extract" | "judge" | "derive" | "inspect";

export type ProgressEvent =
  | { type: "step"; step: StepName; status: "start" | "done"; detail?: string }
  | { type: "partial"; result: Partial<AnalysisResult> }
  | { type: "done"; result: AnalysisResult }
  | { type: "error"; message: string };
