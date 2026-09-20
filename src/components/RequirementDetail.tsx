import type { Requirement, ReviewFlag, Utterance } from "../../shared/types.ts";
import { KIND_LABELS, priorityLabel, priorityTone } from "../labels.ts";
import { ChoiceJudgement, NoulJudgement, ScoreJudgement } from "./Judgement.tsx";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function QualityItem({ name, value, better }: { name: string; value: number; better: "high" | "low" }) {
  const good = better === "high" ? value : 1 - value;
  const tone = good >= 0.8 ? "fill-ok" : good >= 0.6 ? "fill-warn" : "fill-bad";
  return (
    <div className="quality-item">
      <div className="qname">
        <span>{name}</span>
        <b>{pct(value)}</b>
      </div>
      <div className="bar" style={{ height: 5 }}>
        <i className={`fill ${tone}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

export function RequirementDetail({
  requirement,
  utterances,
  flags,
}: {
  requirement: Requirement;
  utterances: Utterance[];
  flags: ReviewFlag[];
}) {
  const byId = new Map(utterances.map((u) => [u.id, u]));
  const j = requirement.judgement;
  const mine = flags.filter((f) => f.requirementId === requirement.id);

  return (
    <div className="card detail">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span className="mono muted" style={{ fontWeight: 700 }}>{requirement.id}</span>
        <span className={`tag tag-${j.kind.choice}`}>{KIND_LABELS[j.kind.choice]}</span>
        <span className={`tag ${priorityTone(j.priority.score)}`}>{priorityLabel(j.priority.score)}</span>
        {j.settled.noul >= 0.5 ? (
          <span className="tag tag-ok">方針まで合意</span>
        ) : (
          <span className="tag tag-neutral">要望が出た段階</span>
        )}
        <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{requirement.speaker}</span>
      </div>

      <h3>{requirement.statement}</h3>
      {requirement.background && (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>{requirement.background}</p>
      )}

      {mine.length > 0 && (
        <section>
          <h4>確認が必要な点</h4>
          {mine.map((f, i) => (
            <div className="flag" data-severity={f.severity} key={i}>
              <span className="target mono">{f.specId ?? f.requirementId}</span>
              <span className="reason">{f.reason}</span>
            </div>
          ))}
        </section>
      )}

      <section>
        <h4>根拠になった発言</h4>
        {requirement.sourceIds.length === 0 && <p className="muted">特定できませんでした。</p>}
        {requirement.sourceIds.map((id) => {
          const u = byId.get(id);
          if (!u) return null;
          return (
            <div className="quote" key={id}>
              <span className="num mono">[{u.id}]</span>
              <span className="speaker">{u.speaker}</span>
              {u.text}
            </div>
          );
        })}
      </section>

      <section>
        <h4>JEVの判定</h4>
        <div className="judgements">
          <ChoiceJudgement name="区分" answer={j.kind} labels={KIND_LABELS} />
          <ScoreJudgement name="優先度" answer={j.priority} />
          <ScoreJudgement name="曖昧さ(高いほど追加ヒアリングが必要)" answer={j.vagueness} />
          <NoulJudgement
            name="発言への根拠"
            answer={j.grounded}
            better="high"
            note="低い場合、抽出のときに発言にない条件が足された可能性があります"
          />
          <NoulJudgement
            name="その場で方針まで固まったか"
            answer={j.settled}
            better="high"
            note="低い項目は次回までに詰める対象になります"
          />
        </div>
      </section>

      <section>
        <h4>要件案 {requirement.specs.length > 0 && `(${requirement.specs.length}件)`}</h4>
        {requirement.specs.length === 0 && (
          <p className="muted">
            {j.kind.choice === "issue"
              ? "困りごとの表明にとどまり、何を作るべきかがまだ定まらないため要件を起こしていません。"
              : "要件案は導出されていません。"}
          </p>
        )}
        {requirement.specs.map((s) => (
          <div className="spec" key={s.id}>
            <div className="statement">
              <span className="mono muted" style={{ marginRight: 8, fontSize: 11.5 }}>{s.id}</span>
              {s.statement}
            </div>
            {s.quality && (
              <div className="quality">
                <QualityItem name="検証可能" value={s.quality.verifiable.noul} better="high" />
                <QualityItem name="要求のカバー" value={s.quality.covers.noul} better="high" />
                <QualityItem name="単一事項" value={s.quality.atomic.noul} better="high" />
                <QualityItem name="曖昧語" value={s.quality.vagueWords.noul} better="low" />
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
