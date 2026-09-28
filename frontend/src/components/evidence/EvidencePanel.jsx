import { memo, useState } from "react";

import { similarity, num, label as fmtLabel } from "../../lib/format.js";
import { severityFromHistorical } from "../../lib/risk.js";
import {
  IconChevronDown,
  IconExternal,
  IconFile,
  IconSearch
} from "../common/Icons.jsx";

function Field({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <span className="evidence__field">
      <span className="evidence__field-label">{label}</span>
      <span className="evidence__field-value">{value}</span>
    </span>
  );
}

/**
 * One traceable citation. The operator can always move from the
 * AI conclusion to the exact text the retrieval layer matched,
 * and from there to the source document.
 */
function EvidenceCardBase({ item, rank, onViewSource }) {
  const [open, setOpen] = useState(false);

  const metadata = item?.metadata ?? {};
  const relevance = typeof item?.relevance === "number" ? item.relevance : null;
  const severity = severityFromHistorical(metadata.severity);
  const eventLabel = fmtLabel(metadata.event, "Historical record");

  return (
    <article
      className={`evidence${open ? " is-open" : ""}`}
      data-sev={severity === "none" ? "info" : severity}
    >
      <header className="evidence__head">
        <span className="evidence__rank">#{rank}</span>
        <span className="evidence__source">{fmtLabel(metadata.source)}</span>
        {relevance !== null ? (
          <span
            className="evidence__relevance"
            title="Cosine similarity from the FAISS index — a ranking signal, not a confidence estimate"
          >
            <span className="evidence__relevance-bar">
              <span
                style={{
                  width: `${Math.max(0, Math.min(100, relevance * 100))}%`
                }}
              />
            </span>
            {similarity(relevance, 1)}
          </span>
        ) : null}
      </header>

      <div className="evidence__meta">
        <Field label="Well" value={fmtLabel(metadata.well_id)} />
        <Field
          label="Depth"
          value={
            typeof metadata.depth === "number"
              ? `${num(metadata.depth, 0)} m`
              : null
          }
        />
        <Field label="Event" value={eventLabel} />
        <Field label="Formation" value={fmtLabel(metadata.formation)} />
      </div>

      <p className="evidence__excerpt">{item?.text ?? ""}</p>

      <footer className="evidence__actions">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <IconChevronDown
            size={12}
            style={{
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 160ms"
            }}
          />
          {open ? "Collapse" : "Expand"}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--primary"
          onClick={() => onViewSource?.(metadata.source, item)}
        >
          <IconFile size={12} />
          View source
        </button>
        {open ? (
          <span className="label" style={{ marginLeft: "auto" }}>
            <IconSearch size={10} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
            Chunk {fmtLabel(item?.id)}
          </span>
        ) : null}
      </footer>
    </article>
  );
}

export const EvidenceCard = memo(EvidenceCardBase);

/**
 * The evidence surface. It always shows the retrieval query
 * that produced the ranking, so "why these documents?" has a
 * literal answer on screen.
 */
function EvidencePanelBase({ contextual, onViewSource, onOpenDocuments }) {
  const documents = contextual?.document_evidence ?? [];
  const query = contextual?.explainability?.retrieval_query ?? null;

  if (documents.length === 0) {
    return (
      <div className="state state--tight state--info">
        <span className="state__icon" aria-hidden="true">
          <IconSearch size={16} />
        </span>
        <p className="state__title">No document evidence retrieved</p>
        <p className="state__text">
          The semantic search returned no chunk above the index floor for
          this depth and formation. The historical event list above is
          still drawn from the structured event table.
        </p>
        {onOpenDocuments ? (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onOpenDocuments}
          >
            <IconExternal size={12} />
            Open document intelligence
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="evidence-list">
        {documents.map((item, index) => (
          <EvidenceCard
            key={item?.id ?? index}
            item={item}
            rank={index + 1}
            onViewSource={onViewSource}
          />
        ))}
      </div>

      {query ? (
        <details className="disclosure">
          <summary className="disclosure__summary">
            <IconChevronDown
              size={12}
              className="disclosure__chevron"
              style={{ transform: "none" }}
            />
            How these documents were selected
          </summary>
          <div className="disclosure__content">
            <span>
              The retrieval query below was built by the backend from the
              active formation, the live bit depth and the dominant
              historical event, then executed against the{" "}
              <strong>FAISS sentence-transformer index</strong>. Documents
              are ranked by cosine similarity to that query.
            </span>
            <code
              style={{
                display: "block",
                padding: "var(--s-4)",
                background: "var(--bg-abyss)",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-2)",
                color: "var(--info)",
                fontSize: "var(--fs-xs)",
                lineHeight: 1.6,
                overflowWrap: "anywhere"
              }}
            >
              {query}
            </code>
            <span>
              <IconSearch size={11} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
              Relevance is a vector-similarity score used for ranking. It
              is <strong>not</strong> a probability and not a statement
              that the incident will recur.
            </span>
          </div>
        </details>
      ) : null}
    </>
  );
}

export const EvidencePanel = memo(EvidencePanelBase);
export default EvidencePanel;
