import type { UsageReport } from "../../shared/types.ts";

const usd = (v: number) => `$${v.toFixed(5)}`;
const num = (v: number) => v.toLocaleString("ja-JP");

export function CostPanel({ usage, model, elapsedMs }: { usage: UsageReport; model: string; elapsedMs: number }) {
  const saved = Math.max(0, usage.claudeOnlyUsd - usage.totalUsd);
  const savedPct = usage.claudeOnlyUsd > 0 ? Math.round((saved / usage.claudeOnlyUsd) * 100) : 0;
  const total = Math.max(usage.claudeOnlyUsd, usage.totalUsd) || 1;

  return (
    <div>
      <div className="cost-grid">
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ fontSize: 13, marginBottom: 10 }}>
            <span className="who who-jev" style={{ marginRight: 8 }}>JEV</span>
            判定
          </h4>
          <div className="cost-row"><span>リクエスト</span><span className="v mono">{num(usage.jev.requests)}</span></div>
          <div className="cost-row"><span>入力トークン</span><span className="v mono">{num(usage.jev.inputTokens)}</span></div>
          <div className="cost-row"><span>出力トークン</span><span className="v mono">{num(usage.jev.outputTokens)} <span className="muted">(無料)</span></span></div>
          <div className="cost-row"><span>単価</span><span className="v mono muted">$0.042 / 1M</span></div>
          <div className="cost-row"><span><b>コスト</b></span><span className="v mono"><b>{usd(usage.jev.costUsd)}</b></span></div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ fontSize: 13, marginBottom: 10 }}>
            <span className="who who-claude" style={{ marginRight: 8 }}>Claude</span>
            抽出・導出
          </h4>
          <div className="cost-row"><span>リクエスト</span><span className="v mono">{num(usage.claude.requests)}</span></div>
          <div className="cost-row"><span>入力トークン</span><span className="v mono">{num(usage.claude.inputTokens)}</span></div>
          <div className="cost-row"><span>出力トークン</span><span className="v mono">{num(usage.claude.outputTokens)}</span></div>
          <div className="cost-row"><span>モデル</span><span className="v mono muted">{model}</span></div>
          <div className="cost-row"><span><b>コスト</b></span><span className="v mono"><b>{usd(usage.claude.costUsd)}</b></span></div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 14 }}>
        <h4 style={{ fontSize: 13, marginBottom: 4 }}>判定をJEVに寄せたことによる差</h4>
        <p className="muted" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
          JEVが担当した判定をすべてClaudeにやらせた場合の推定と比べています。
          判定の出力トークンはClaudeでは入力の5倍の単価がかかる一方、JEVでは無料です。
        </p>
        <div className="compare-bar">
          <span className="seg seg-jev" style={{ width: `${(usage.jev.costUsd / total) * 100}%` }} />
          <span className="seg seg-claude" style={{ width: `${(usage.claude.costUsd / total) * 100}%` }} />
          <span className="seg seg-saved" style={{ width: `${(saved / total) * 100}%` }} />
        </div>
        <div className="legend">
          <span><i className="sw seg-jev" />JEVの判定 {usd(usage.jev.costUsd)}</span>
          <span><i className="sw seg-claude" />Claudeの抽出・導出 {usd(usage.claude.costUsd)}</span>
          <span><i className="sw seg-saved" />JEVに寄せて払わずに済んだ分 {usd(saved)}</span>
        </div>
        <div className="cost-row"><span>今回のコスト</span><span className="v mono">{usd(usage.totalUsd)}</span></div>
        <div className="cost-row"><span>すべてClaudeで行った場合(推定)</span><span className="v mono">{usd(usage.claudeOnlyUsd)}</span></div>
        <div className="cost-row">
          <span><b>削減</b></span>
          <span className="v mono"><b>{usd(saved)} / {savedPct}%</b></span>
        </div>
        <div className="cost-row"><span>所要時間</span><span className="v mono">{(elapsedMs / 1000).toFixed(1)}秒</span></div>
        {usage.screenedOutRatio > 0 && (
          <div className="cost-row">
            <span>前段の選別でClaudeに渡さなかった文字</span>
            <span className="v mono">{Math.round(usage.screenedOutRatio * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
