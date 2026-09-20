import type { ChoiceAnswer, NoulAnswer, ScoreAnswer } from "../../shared/types.ts";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 値が高いほど良い軸と、低いほど良い軸があるので、色は呼び出し側の指定で決める */
function toneFor(value: number, better: "high" | "low"): string {
  const good = better === "high" ? value : 1 - value;
  if (good >= 0.8) return "fill-ok";
  if (good >= 0.6) return "fill-warn";
  return "fill-bad";
}

export function NoulJudgement({
  name,
  answer,
  better,
  note,
}: {
  name: string;
  answer: NoulAnswer;
  better: "high" | "low";
  note?: string;
}) {
  return (
    <div className="judgement">
      <div className="head">
        <span className="name">{name}</span>
        <span className="verdict mono">{pct(answer.noul)}</span>
      </div>
      <div className="bar">
        <i
          className={`fill ${toneFor(answer.noul, better)}`}
          style={{ width: `${answer.noul * 100}%` }}
        />
      </div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function ChoiceJudgement({
  name,
  answer,
  labels,
}: {
  name: string;
  answer: ChoiceAnswer;
  labels: Record<string, string>;
}) {
  const ordered = Object.entries(answer.probabilities).sort(([, a], [, b]) => b - a);
  return (
    <div className="judgement">
      <div className="head">
        <span className="name">{name}</span>
        <span className="verdict mono">
          {labels[answer.choice] ?? answer.choice}
          <span className="muted"> / 確信度 {pct(answer.confidence)}</span>
        </span>
      </div>
      <div className="dist">
        {ordered.map(([key, p]) => (
          <div className="seg" key={key} data-top={key === answer.choice}>
            <span>
              {labels[key] ?? key} {pct(p)}
            </span>
            <span className="track">
              <i style={{ width: `${p * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoreJudgement({ name, answer }: { name: string; answer: ScoreAnswer }) {
  const levels = Object.keys(answer.legend).sort((a, b) => Number(a) - Number(b));
  const max = levels.length - 1;
  const top = String(Math.round(answer.score));
  return (
    <div className="judgement">
      <div className="head">
        <span className="name">{name}</span>
        <span className="verdict mono">
          {answer.score.toFixed(1)} / {max}
          <span className="muted"> · 確信度 {pct(answer.confidence)}</span>
        </span>
      </div>
      <div className="bar">
        <i className="fill fill-accent" style={{ width: `${(answer.score / max) * 100}%` }} />
      </div>
      <div className="dist">
        {levels.map((level) => (
          <div className="seg" key={level} data-top={level === top}>
            <span>
              {level}: {pct(answer.probabilities[level] ?? 0)}
            </span>
            <span className="track">
              <i style={{ width: `${(answer.probabilities[level] ?? 0) * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
      <div className="note">{answer.legend[top]}</div>
    </div>
  );
}
