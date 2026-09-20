import { useEffect, useRef, useState } from "react";
import type { AnalysisOptions, AnalysisResult, StepName } from "../shared/types.ts";
import { fetchHealth, runAnalysis, type Health } from "./api.ts";
import { TranscriptInput } from "./components/TranscriptInput.tsx";
import { RunProgress, type StepState } from "./components/RunProgress.tsx";
import { ResultView } from "./components/ResultView.tsx";

const DEFAULT_OPTIONS: AnalysisOptions = {
  prescreen: true,
  prescreenThreshold: 0.2,
  deriveSpecs: true,
  model: "claude-opus-5",
};

function stepOrder(options: AnalysisOptions): StepName[] {
  const steps: StepName[] = ["parse"];
  if (options.prescreen) steps.push("screen");
  steps.push("extract", "judge");
  if (options.deriveSpecs) steps.push("derive", "inspect");
  return steps;
}

export default function App() {
  const [transcript, setTranscript] = useState("");
  const [options, setOptions] = useState<AnalysisOptions>(DEFAULT_OPTIONS);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((h) => {
        setHealth(h);
        setOptions((o) => ({ ...o, model: h.defaultModel || o.model }));
      })
      .catch(() => setError("APIサーバーに接続できません。npm run dev でサーバーが起動しているか確認してください。"));
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setResult(null);
    setSteps({});

    try {
      for await (const event of runAnalysis(transcript, options, controller.signal)) {
        if (event.type === "step") {
          setSteps((prev) => ({
            ...prev,
            [event.step]: { status: event.status === "start" ? "running" : "done", detail: event.detail },
          }));
        } else if (event.type === "done") {
          setResult(event.result);
        } else if (event.type === "error") {
          setError(event.message);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setResult(null);
    setSteps({});
    setError(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>MTG文字起こし 要求・要件整理</h1>
        <span className="sub">抽出: Claude / 判定: JEV</span>
        <span className="header-spacer" />
        {health && (
          <span className="muted mono" style={{ fontSize: 11.5 }}>
            {health.jev ? "JEV 接続可" : "JEV 未設定"} · {health.claude ? "Claude 接続可" : "Claude 未設定"}
          </span>
        )}
      </header>

      <main className="main">
        {error && (
          <div className="center-column">
            <div className="banner banner-error">{error}</div>
          </div>
        )}

        {result ? (
          <ResultView result={result} onReset={reset} />
        ) : running ? (
          <RunProgress steps={steps} order={stepOrder(options)} />
        ) : (
          <TranscriptInput
            value={transcript}
            onChange={setTranscript}
            options={options}
            onOptionsChange={setOptions}
            onRun={run}
            running={running}
            health={health}
          />
        )}
      </main>
    </div>
  );
}
