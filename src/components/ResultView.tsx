import { useState } from "react";
import type { AnalysisResult } from "../../shared/types.ts";
import { KIND_LABELS, priorityLabel, priorityTone } from "../labels.ts";
import { RequirementDetail } from "./RequirementDetail.tsx";
import { CostPanel } from "./CostPanel.tsx";
import { DocumentsView } from "./DocumentsView.tsx";

type Tab = "documents" | "requirements" | "flags" | "cost";

export function ResultView({ result, onReset }: { result: AnalysisResult; onReset: () => void }) {
  const [tab, setTab] = useState<Tab>("documents");
  const [selectedId, setSelectedId] = useState(result.requirements[0]?.id ?? "");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const selected = result.requirements.find((r) => r.id === selectedId) ?? result.requirements[0];
  const specTotal = result.requirements.reduce((a, r) => a + r.specs.length, 0);
  const highFlags = result.flags.filter((f) => f.severity === "high").length;

  const visible = result.requirements.filter(
    (r) => kindFilter === "all" || r.judgement.kind.choice === kindFilter
  );

  const kindCounts = result.requirements.reduce<Record<string, number>>((acc, r) => {
    acc[r.judgement.kind.choice] = (acc[r.judgement.kind.choice] ?? 0) + 1;
    return acc;
  }, {});

  const jump = (requirementId: string) => {
    setKindFilter("all");
    setSelectedId(requirementId);
    setTab("requirements");
  };

  return (
    <div>
      <div className="summary">
        <div className="cell">
          <div className="label">発言</div>
          <div className="value">{result.utterances.length}</div>
        </div>
        <div className="cell">
          <div className="label">要求</div>
          <div className="value">
            {result.requirements.length}
            <small>
              {Object.entries(kindCounts)
                .map(([k, v]) => `${KIND_LABELS[k] ?? k}${v}`)
                .join(" ")}
            </small>
          </div>
        </div>
        <div className="cell">
          <div className="label">要件案</div>
          <div className="value">{specTotal}</div>
        </div>
        <div className="cell">
          <div className="label">確認が必要</div>
          <div className="value">
            {result.flags.length}
            {highFlags > 0 && <small>うち要対応 {highFlags}</small>}
          </div>
        </div>
        <div className="cell">
          <div className="label">コスト</div>
          <div className="value">
            ${result.usage.totalUsd.toFixed(4)}
            <small>{(result.elapsedMs / 1000).toFixed(0)}秒</small>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button aria-selected={tab === "documents"} onClick={() => setTab("documents")}>
          成果物<span className="count">3</span>
        </button>
        <button aria-selected={tab === "requirements"} onClick={() => setTab("requirements")}>
          要求と要件<span className="count">{result.requirements.length}</span>
        </button>
        <button aria-selected={tab === "flags"} onClick={() => setTab("flags")}>
          確認が必要<span className="count">{result.flags.length}</span>
        </button>
        <button aria-selected={tab === "cost"} onClick={() => setTab("cost")}>
          トークンとコスト
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", paddingBottom: 6 }}>
          <button className="btn btn-sm" onClick={onReset}>別の文字起こしを解析</button>
        </div>
      </div>

      {tab === "requirements" && (
        <div className="split">
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <button
                className={`btn btn-sm${kindFilter === "all" ? " btn-primary" : ""}`}
                onClick={() => setKindFilter("all")}
              >
                すべて {result.requirements.length}
              </button>
              {Object.entries(kindCounts).map(([kind, count]) => (
                <button
                  key={kind}
                  className={`btn btn-sm${kindFilter === kind ? " btn-primary" : ""}`}
                  onClick={() => setKindFilter(kind)}
                >
                  {KIND_LABELS[kind] ?? kind} {count}
                </button>
              ))}
            </div>
            <div className="req-list">
              {visible.map((r) => {
                const flagCount = result.flags.filter((f) => f.requirementId === r.id).length;
                return (
                  <button
                    key={r.id}
                    className="req-card"
                    aria-selected={r.id === selected?.id}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <div className="top">
                      <span className="id mono">{r.id}</span>
                      <span className={`tag tag-${r.judgement.kind.choice}`}>
                        {KIND_LABELS[r.judgement.kind.choice]}
                      </span>
                      <span className={`tag ${priorityTone(r.judgement.priority.score)}`}>
                        {priorityLabel(r.judgement.priority.score)}
                      </span>
                    </div>
                    <div className="statement">{r.statement}</div>
                    <div className="bottom">
                      <span>{r.speaker}</span>
                      <span className="mono">発言 {r.sourceIds.join(", ") || "-"}</span>
                      {r.specs.length > 0 && <span>要件 {r.specs.length}</span>}
                      {flagCount > 0 && (
                        <span className="tag tag-warn" style={{ marginLeft: "auto" }}>要確認 {flagCount}</span>
                      )}
                    </div>
                  </button>
                );
              })}
              {visible.length === 0 && <div className="empty">該当する要求はありません。</div>}
            </div>
          </div>
          {selected ? (
            <RequirementDetail requirement={selected} utterances={result.utterances} flags={result.flags} />
          ) : (
            <div className="card empty">要求を選んでください。</div>
          )}
        </div>
      )}

      {tab === "flags" && (
        <div>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            JEVの確率から機械的に立てた項目です。確率が割れていること自体を「人が見るべき」という信号として扱っています。
          </p>
          {result.flags.length === 0 && <div className="card empty">確認が必要な項目はありませんでした。</div>}
          {result.flags.map((f, i) => {
            const parent = result.requirements.find((r) => r.id === f.requirementId);
            const spec = parent?.specs.find((s) => s.id === f.specId);
            return (
              <button className="flag" data-severity={f.severity} key={i} onClick={() => jump(f.requirementId)}>
                <span className="target mono">{f.specId ?? f.requirementId}</span>
                <span>
                  <span className="reason">{f.reason}</span>
                  <span className="context">{spec?.statement ?? parent?.statement}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {tab === "documents" && <DocumentsView result={result} />}

      {tab === "cost" && (
        <CostPanel usage={result.usage} model={result.options.model} elapsedMs={result.elapsedMs} />
      )}
    </div>
  );
}
