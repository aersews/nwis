import { memo, useState } from "react";

import { similarity, isNum, num, label as fmtLabel } from "../../lib/format.js";
import { severityFromHistorical } from "../../lib/risk.js";
import {
  IconChevronDown,
  IconExternal,
  IconFile,
  IconSearch
} from "../common/Icons.jsx";

function Field({ label, value, tone }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <span
      className="evidence__field"
      data-sev={tone}
    >
      <span className="evidence__field-label">{label}</span>
      <span className="evidence__field-value">{value}</span>
    </span>
  );
}

/**
 * One traceable citation. The operator can always move from the
 * AI conclusion to the exact text the retrieval layer matched,
 * and from there to the source document.
 *
 * Every field is what the index actually holds. A pageless
 * source says "Page unavailable" rather than showing a number
 * nobody recorded, and an unknown severity is not rendered as
 * low risk.
 */
function EvidenceCardBase({
  item,
  rank,
  onViewSource,
  currentDepth
}) {
  const [open, setOpen] = useState(false);

  const metadata = item?.metadata ?? {};
  const relevance = typeof item?.relevance === "number" ? item.relevance : null;
  const severity = severityFromHistorical(metadata.severity);
  const eventLabel = fmtLabel(metadata.event, "Historical record");

  const pageAvailable = metadata.page_available === true;
  const pageLabel = pageAvailable
    ? String(metadata.page)
    : "Page unavailable";

  const documentDepth = typeof metadata.depth === "number"
    ? metadata.depth
    : null;

  const depthDifference =
    documentDepth !== null &&
    typeof currentDepth === "number"
      ? Math.abs(documentDepth - currentDepth)
      : null;

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
            title="Hybrid retrieval score — a ranking signal, not a confidence estimate"
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
            documentDepth !== null
              ? `${num(documentDepth, 0)} m`
              : "Not recorded"
          }
        />
        <Field
          label="Current depth"
          value={
            typeof currentDepth === "number"
              ? `${num(currentDepth, 0)} m`
              : null
          }
        />
        <Field
          label="Depth difference"
          value={
            depthDifference !== null
              ? `${num(depthDifference, 0)} m`
              : "Not available"
          }
          tone={
            depthDifference !== null && depthDifference <= 50
              ? "high"
              : "none"
          }
        />
        <Field label="Formation" value={fmtLabel(metadata.formation)} />
        <Field label="Event" value={eventLabel} />
        <Field
          label="Severity"
          value={
            metadata.severity &&
            metadata.severity !== "UNKNOWN"
              ? fmtLabel(metadata.severity)
              : "Not recorded"
          }
          tone={severity === "none" ? "none" : severity}
        />
        <Field label="Source" value={fmtLabel(metadata.source)} />
        <Field
          label="Page"
          value={pageLabel}
          tone={pageAvailable ? "none" : "info"}
        />
        <Field
          label="Date"
          value={metadata.date ?? "Not recorded"}
        />
        <Field
          label="Relevance"
          value={relevance !== null ? similarity(relevance, 2) : "Not available"}
        />
      </div>

      <p className="evidence__excerpt">{item?.text ?? ""}</p>

      {open && metadata.lesson_learned ? (
        <div className="evidence__section">
          <span className="label">Lesson learned</span>
          <p>{metadata.lesson_learned}</p>
        </div>
      ) : null}

      {open && metadata.mitigation ? (
        <div className="evidence__section">
          <span className="label">Mitigation recorded</span>
          <p>{metadata.mitigation}</p>
        </div>
      ) : null}

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
          {open ? "Collapse evidence" : "Expand evidence"}
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
          <span
            className="label"
            style={{ marginLeft: "auto" }}
          >
            <IconSearch
              size={10}
              style={{ display: "inline", verticalAlign: "-1px" }}
            />{" "}
            Chunk {fmtLabel(item?.id)}
            {isNum(item?.vector_score) ? (
              <>
                {" · "}
                vector{" "}
                <span className="mono">
                  {num(item.vector_score, 3)}
                </span>
              </>
            ) : null}
            {isNum(item?.lexical_score) ? (
              <>
                {" · "}
                BM25{" "}
                <span className="mono">
                  {num(item.lexical_score, 3)}
                </span>
              </>
            ) : null}
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
function EvidencePanelBase({
  contextual,
  onViewSource,
  onOpenDocuments,
  currentDepth
}) {
  const documents = contextual?.document_evidence ?? [];
  const query =
    contextual?.explainability?.retrieval_query ?? null;
  const retrieval = contextual?.retrieval ?? null;

  if (documents.length === 0) {
    return (
      <div className="state state--tight state--info">
        <span className="state__icon" aria-hidden="true">
          <IconSearch size={16} />
        </span>
        <p className="state__title">No document evidence retrieved</p>
        <p className="state__text">
          The hybrid search returned no chunk above the index floor
          for this depth and formation. The historical event list
          above is still drawn from the structured event table.
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
            currentDepth={currentDepth}
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
              The retrieval query below was built by the backend
              from the active formation, the live bit depth and the
              dominant historical event. It is then executed as a{" "}
              <strong>hybrid search</strong>: BM25 lexical
              similarity and vector similarity from the{" "}
              <strong>FAISS sentence-transformer index</strong>,
              combined
              {retrieval?.config?.vector_weight
                ? ` ${Math.round(
                    retrieval.config.vector_weight * 100
                  )}% vector / ${Math.round(
                    retrieval.config.lexical_weight * 100
                  )}% lexical`
                : null}
              , with the formation, event type and depth applied
              as hard filters before scoring.
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
            {retrieval?.filters ? (
              <div className="kv kv--inline">
                <div className="kv__cell">
                  <span className="kv__label">
                    Formation filter
                  </span>
                  <span className="kv__value">
                    {fmtLabel(retrieval.filters.formation)}
                  </span>
                </div>
                <div className="kv__cell">
                  <span className="kv__label">Event filter</span>
                  <span className="kv__value">
                    {retrieval.filters.event_type
                      ? fmtLabel(retrieval.filters.event_type)
                      : "None"}
                  </span>
                </div>
                <div className="kv__cell">
                  <span className="kv__label">Depth window</span>
                  <span className="kv__value mono">
                    {num(retrieval.filters.reference_depth, 0)}
                    {" m ± "}
                    {num(retrieval.filters.depth_window_m, 0)}
                    {" m"}
                  </span>
                </div>
                <div className="kv__cell">
                  <span className="kv__label">Chunks returned</span>
                  <span className="kv__value">
                    {retrieval.returned}
                  </span>
                </div>
              </div>
            ) : null}
            <span>
              <IconSearch
                size={11}
                style={{ display: "inline", verticalAlign: "-1px" }}
              />{" "}
              Relevance is a retrieval similarity used for ranking.
              It is <strong>not</strong> a probability and not a
              statement that the incident will recur. A chunk with
              no recorded depth is never rejected by the depth
              filter; it is reported as unavailable instead.
            </span>
          </div>
        </details>
      ) : null}
    </>
  );
}

export const EvidencePanel = memo(EvidencePanelBase);
export default EvidencePanel;
