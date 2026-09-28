import { memo, useMemo, useState } from "react";

import { DocumentStats } from "./DocumentViewer.jsx";
import { EmptyState, SkeletonRows } from "../common/States.jsx";
import { isNum, label as fmtLabel, num } from "../../lib/format.js";
import { splitHighlight } from "../../lib/format.js";
import {
  IconDatabase,
  IconFile,
  IconSearch
} from "../common/Icons.jsx";

function Highlight({ text, terms }) {
  const parts = useMemo(
    () => splitHighlight(text, terms),
    [text, terms]
  );
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>
      )}
    </>
  );
}

function DocumentExplorerBase({
  documents,
  events = [],
  loading,
  error,
  onRetry,
  onOpenSource,
  activeSource
}) {
  const [filter, setFilter] = useState("");

  const sources = useMemo(() => documents?.sources ?? [], [documents]);
  const terms = useMemo(
    () => filter.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [filter]
  );

  const visible = useMemo(() => {
    if (terms.length === 0) return sources;
    return sources.filter((source) => {
      const haystack = [
        source.source,
        source.well_id,
        source.formation,
        ...(source.events ?? [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [sources, terms]);

  const eventsByWell = useMemo(() => {
    const map = {};
    for (const event of events) {
      map[event.well_id] = (map[event.well_id] ?? 0) + 1;
    }
    return map;
  }, [events]);

  if (loading && !documents) return <SkeletonRows rows={4} columns={[0.4, 1, 0.3]} />;

  if (error && !documents) {
    return (
      <EmptyState
        severity="critical"
        icon={<IconDatabase size={16} />}
        title="Document index unavailable"
        message={error}
        action={
          onRetry ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
              Retry index read
            </button>
          ) : null
        }
      />
    );
  }

  return (
    <>
      <DocumentStats documents={documents} />

      <div
        style={{
          display: "flex",
          gap: "var(--s-5)",
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between"
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-4)",
            flex: "1 1 200px",
            minWidth: 0
          }}
        >
          <IconSearch size={13} style={{ color: "var(--text-faint)", flex: "0 0 auto" }} />
          <span className="sr-only">Filter indexed documents</span>
          <input
            className="input"
            type="search"
            value={filter}
            placeholder="Filter by file, well, formation or event…"
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <span className="label" style={{ whiteSpace: "nowrap" }}>
          {visible.length} of {sources.length} sources
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          compact
          severity="info"
          icon={<IconFile size={16} />}
          title="No matching documents"
          message="No indexed source matches that filter."
          action={
            filter ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setFilter("")}
              >
                Clear filter
              </button>
            ) : null
          }
        />
      ) : (
        <div className="well-list" style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-2)" }}>
          {visible.map((source) => (
            <button
              type="button"
              className="doc-row"
              key={source.source}
              onClick={() => onOpenSource?.(source.source)}
              aria-current={activeSource === source.source ? "true" : undefined}
              style={
                activeSource === source.source
                  ? { background: "#4d9dff12", boxShadow: "inset 2px 0 0 var(--info)" }
                  : undefined
              }
            >
              <IconFile size={14} className="doc-row__glyph" />
              <span style={{ minWidth: 0 }}>
                <span className="doc-row__name">
                  <Highlight text={fmtLabel(source.source)} terms={terms} />
                </span>
                <span className="doc-row__meta">
                  <span>
                    well <b>{fmtLabel(source.well_id)}</b>
                  </span>
                  {isNum(source.depth) ? (
                    <span>
                      depth <b>{num(source.depth, 0)} m</b>
                    </span>
                  ) : null}
                  <span>
                    <b>{source.chunks}</b> chunk{source.chunks === 1 ? "" : "s"}
                  </span>
                  {isNum(eventsByWell[source.well_id]) ? (
                    <span>
                      <b>{eventsByWell[source.well_id]}</b> structured event
                      {eventsByWell[source.well_id] === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="badge badge--plain" style={{ height: 16 }}>
                {source.format?.toUpperCase() ?? "?"}
              </span>
              <span
                className="badge"
                data-sev={source.requires_ocr ? "medium" : "low"}
                style={{ height: 16 }}
                title={
                  source.requires_ocr
                    ? "PDF source — per-page OCR fallback is enabled in the extraction pipeline"
                    : "Plain-text source — no OCR step required"
                }
              >
                {source.requires_ocr ? "OCR" : "TEXT"}
              </span>
            </button>
          ))}
        </div>
      )}

      {documents?.pipeline ? (
        <p className="note">
          <IconDatabase size={13} className="note__icon" />
          <span>
            Embedding model <strong>{documents.pipeline.embedding_model}</strong>{" "}
            · {documents.pipeline.metric} · {documents.pipeline.extraction}.
            Counts are read live from the FAISS index and chunk store, so they
            reflect the corpus actually available to retrieval.
          </span>
        </p>
      ) : null}

      {documents && !documents.index ? (
        <p className="note">
          <IconDatabase size={13} className="note__icon" />
          <span>
            No vector index is present. Retrieval will return nothing until{" "}
            <span className="mono">POST /api/rag/build</span> has been run.
          </span>
        </p>
      ) : null}
    </>
  );
}

export const DocumentExplorer = memo(DocumentExplorerBase);
export default DocumentExplorer;
