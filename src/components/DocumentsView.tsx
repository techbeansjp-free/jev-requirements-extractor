import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AnalysisResult } from "../../shared/types.ts";
import { buildDocuments, type DocumentId } from "../documents.ts";

export function DocumentsView({ result }: { result: AnalysisResult }) {
  const docs = useMemo(() => buildDocuments(result), [result]);
  const [current, setCurrent] = useState<DocumentId>("requirements");
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const [copied, setCopied] = useState(false);

  const doc = docs.find((d) => d.id === current) ?? docs[0];

  const copy = async () => {
    await navigator.clipboard.writeText(doc.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div>
      <div className="doc-nav">
        {docs.map((d) => (
          <button key={d.id} className="doc-tab" aria-selected={d.id === current} onClick={() => setCurrent(d.id)}>
            <span className="name mono">{d.filename}</span>
            <span className="desc">{d.summary}</span>
          </button>
        ))}
      </div>

      <div className="doc-toolbar">
        <div className="switch">
          <button aria-selected={mode === "preview"} onClick={() => setMode("preview")}>
            プレビュー
          </button>
          <button aria-selected={mode === "source"} onClick={() => setMode("source")}>
            Markdown
          </button>
        </div>
        <span className="muted mono" style={{ fontSize: 11.5 }}>
          {doc.markdown.length.toLocaleString("ja-JP")}文字
        </span>
        <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={copy}>
          {copied ? "コピーしました" : "Markdownをコピー"}
        </button>
      </div>

      {mode === "preview" ? (
        <div className="doc-sheet">
          <div className="doc-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.markdown}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="markdown-preview">{doc.markdown}</div>
      )}
    </div>
  );
}
