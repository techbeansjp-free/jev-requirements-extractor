import type { AnalysisOptions } from "../../shared/types.ts";
import type { Health } from "../api.ts";
import { SAMPLE_TRANSCRIPT } from "../sample.ts";
import { STEP_LABELS, WHO_LABELS } from "../labels.ts";

const PIPELINE: Array<keyof typeof STEP_LABELS> = ["screen", "extract", "judge", "derive", "inspect"];

export function TranscriptInput({
  value,
  onChange,
  options,
  onOptionsChange,
  onRun,
  running,
  health,
}: {
  value: string;
  onChange: (v: string) => void;
  options: AnalysisOptions;
  onOptionsChange: (o: AnalysisOptions) => void;
  onRun: () => void;
  running: boolean;
  health: Health | null;
}) {
  const lines = value.split("\n").filter((l) => l.trim()).length;
  const missingKeys = health && (!health.jev || !health.claude);

  return (
    <div className="center-column">
      <div className="intro">
        <h2>文字起こしから要求と要件を起こす</h2>
        <p>
          打ち合わせの文字起こしを貼り付けると、発言から要求を拾い、区分・優先度・具体性を判定して、
          要件案とその品質チェックまで出します。文章を書く工程だけをClaudeが担当し、
          分類と品質判定はすべてJEVが確率つきで返します。
        </p>
      </div>

      <div className="pipeline-strip">
        {PIPELINE.map((step, i) => {
          const meta = STEP_LABELS[step];
          const skipped =
            (step === "screen" && !options.prescreen) ||
            ((step === "derive" || step === "inspect") && !options.deriveSpecs);
          return (
            <span key={step} style={{ display: "contents" }}>
              {i > 0 && <span className="arrow">→</span>}
              <span className="node" style={skipped ? { opacity: 0.35 } : undefined}>
                <span className={`who who-${meta.who}`}>{WHO_LABELS[meta.who]}</span>
                {meta.name}
              </span>
            </span>
          );
        })}
      </div>

      {missingKeys && (
        <div className="banner banner-error">
          APIキーが読み込めていません({!health?.jev && "JEV"} {!health?.claude && "Claude"})。
          環境変数を設定するか、リポジトリ外の <span className="mono">.tokens/</span> にトークンを置いてください。
        </div>
      )}

      <div className="card">
        <div className="editor">
          <div className="editor-bar">
            <button className="btn btn-sm" onClick={() => onChange(SAMPLE_TRANSCRIPT)} disabled={running}>
              サンプルを読み込む
            </button>
            <button className="btn btn-sm" onClick={() => onChange("")} disabled={running || !value}>
              クリア
            </button>
            <span className="muted mono" style={{ marginLeft: "auto", fontSize: 12 }}>
              {lines}行 / {value.length}文字
            </span>
          </div>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={"話者ごとに改行した文字起こしを貼り付けてください。\n\n例:\n鈴木(経理): 月末の請求書作成に3日かかっています。\n田中(営業部): 過去の請求履歴をこちらから見たいです。\n\n行頭のタイムスタンプ([00:12:34] など)は自動で落とします。"}
            disabled={running}
            spellCheck={false}
          />
        </div>

        <div className="options">
          <label className="option">
            <input
              type="checkbox"
              checked={options.prescreen}
              onChange={(e) => onOptionsChange({ ...options, prescreen: e.target.checked })}
              disabled={running}
            />
            JEVで前段の選別を行う
          </label>
          {options.prescreen && (
            <label className="option">
              <span className="muted">閾値</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={options.prescreenThreshold}
                onChange={(e) =>
                  onOptionsChange({ ...options, prescreenThreshold: Number(e.target.value) })
                }
                disabled={running}
                style={{ width: 72 }}
              />
            </label>
          )}
          <label className="option">
            <input
              type="checkbox"
              checked={options.deriveSpecs}
              onChange={(e) => onOptionsChange({ ...options, deriveSpecs: e.target.checked })}
              disabled={running}
            />
            要件案まで導出する
          </label>
          <label className="option">
            <span className="muted">モデル</span>
            <select
              value={options.model}
              onChange={(e) => onOptionsChange({ ...options, model: e.target.value })}
              disabled={running}
            >
              <option value="claude-opus-5">Claude Opus 5</option>
              <option value="claude-sonnet-5">Claude Sonnet 5</option>
              <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
            </select>
          </label>
        </div>

        <div className="run-bar">
          <span className="muted" style={{ fontSize: 12.5 }}>
            前段の選別を切り替えて2回流すと、判定内容とコストの差をそのまま比べられます。
          </span>
          <button className="btn btn-primary" onClick={onRun} disabled={running || !value.trim()}>
            {running ? "解析中" : "解析する"}
          </button>
        </div>
      </div>
    </div>
  );
}
