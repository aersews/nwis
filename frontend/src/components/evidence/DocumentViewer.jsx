import { useEffect, useMemo, useState } from "react";

import { Modal } from "../common/Modal.jsx";
import { ErrorState, LoadingState } from "../common/States.jsx";
import { api } from "../../lib/api.js";
import { splitSections } from "../../lib/documents.js";
import {
  NOT_AVAILABLE,
  isNum,
  label as fmtLabel,
  num
} from "../../lib/format.js";
import {
  IconBook,
  IconDatabase,
  IconFile,
  IconHistory
} from "../common/Icons.jsx";

/**
 * Shows the indexed text of a source document so an engineer
 * can verify any AI statement against the original wording.
 */
export function DocumentViewer({ source, onClose, events = [] }) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!source) return undefined;

    const controller = new AbortController();
    setState({ status: "loading", data: null, error: null });

    api
      .document(source, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", data, error: null });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setState({
          status: "error",
          data: null,
          error: error?.message ?? "Source document unavailable"
        });
      });

    return () => controller.abort();
  }, [source, retryToken]);

  const chunks = useMemo(() => state.data?.chunks ?? [], [state.data]);

  const sections = useMemo(
    () =>
      chunks.map((chunk) => ({
        id: chunk.id,
        text: chunk.text ?? "",
        parsed: splitSections(chunk.text ?? "")
      })),
    [chunks]
  );

  const wellId = state.data?.metadata?.well_id ?? null;
  const relatedEvents = useMemo(
    () => (wellId ? events.filter((e) => e.well_id === wellId) : []),
    [events, wellId]
  );

  return (
    <Modal
      open={Boolean(source)}
      onClose={onClose}
      wide
      eyebrow="Source document"
      severity="info"
      title={fmtLabel(source)}
      tools={
        <span className="badge badge--plain">
          <IconDatabase size={10} /> {chunks.length} chunk
          {chunks.length === 1 ? "" : "s"}
        </span>
      }
      actions={
        <>
          <span className="label" style={{ letterSpacing: "0.1em" }}>
            Indexed content only — the original file is not re-read
          </span>
        </>
      }
    >
      {state.status === "loading" ? (
        <LoadingState label="Retrieving source document…" />
      ) : null}

      {state.status === "error" ? (
        <ErrorState
          title="Source document unavailable"
          message={state.error}
          onRetry={() => setRetryToken((t) => t + 1)}
        />
      ) : null}

      {state.status === "ready" && state.data?.found === false ? (
        <EmptyDocument source={source} />
      ) : null}

      {state.status === "ready" && state.data?.found !== false ? (
        <>
          <div className="kv">
            <div className="kv__cell">
              <span className="kv__label">Source file</span>
              <span className="kv__value">{fmtLabel(source)}</span>
            </div>
            <div className="kv__cell">
              <span className="kv__label">Well</span>
              <span className="kv__value">{fmtLabel(state.data?.metadata?.well_id)}</span>
            </div>
            <div className="kv__cell">
              <span className="kv__label">Depth</span>
              <span className="kv__value">
                {isNum(state.data?.metadata?.depth)
                  ? `${num(state.data.metadata.depth, 0)} m`
                  : NOT_AVAILABLE}
              </span>
            </div>
            <div className="kv__cell">
              <span className="kv__label">Event</span>
              <span className="kv__value">
                {fmtLabel(state.data?.metadata?.event)}
              </span>
            </div>
            <div className="kv__cell">
              <span className="kv__label">Formation</span>
              <span className="kv__value">
                {fmtLabel(state.data?.metadata?.formation)}
              </span>
            </div>
          </div>

          {relatedEvents.length > 0 ? (
            <div className="drawer__section">
              <div className="drawer__section-head">
                <IconHistory size={13} style={{ color: "var(--warn)" }} />
                <span className="label">
                  Structured events recorded for {fmtLabel(wellId)}
                </span>
              </div>
              <div className="deflist">
                {relatedEvents.map((event) => (
                  <div className="deflist__row" key={event.event_id ?? event.depth}>
                    <span className="deflist__key">
                      {fmtLabel(event.event)} · {fmtLabel(event.severity)}
                    </span>
                    <span className="deflist__val">
                      {num(event.depth, 0)} m · {fmtLabel(event.source)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="note">
                <IconBook size={13} className="note__icon" />
                <span>
                  The document text and the structured event table are
                  separate stores. The event row comes from{" "}
                  <span className="mono">/api/events</span>; the text above
                  comes from the vector index.
                </span>
              </p>
            </div>
          ) : null}

          <div className="doc-view">
            {sections.map((chunk) => (
              <div className="doc-section" key={chunk.id}>
                <header className="doc-section__head">
                  <IconFile size={12} style={{ color: "var(--info)" }} />
                  <span className="doc-section__label">Indexed text</span>
                  <span className="doc-section__chunk">{fmtLabel(chunk.id)}</span>
                </header>
                {chunk.parsed.map((section, index) => (
                  <div className="doc-section" key={`${chunk.id}-${index}`} style={{ border: 0, borderRadius: 0 }}>
                    <header
                      className="doc-section__head"
                      style={{ background: "transparent", borderBottom: "1px solid var(--line-soft)" }}
                    >
                      <span className="doc-section__label" style={{ color: "var(--text-mid)" }}>
                        {section.label}
                      </span>
                    </header>
                    <p className="doc-section__text">{section.value}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Modal>
  );
}

function EmptyDocument({ source }) {
  return (
    <div className="state state--info">
      <span className="state__icon" aria-hidden="true">
        <IconFile size={16} />
      </span>
      <p className="state__title">Not in the index</p>
      <p className="state__text">
        <span className="mono">{fmtLabel(source)}</span> has no chunk in the
        vector store. It may have been ingested after the last index build —
        re-run <span className="mono">POST /api/rag/build</span> to refresh.
      </p>
    </div>
  );
}

/**
 * Inventory of the retrieval layer, read from the live FAISS
 * index — every number here is measured, not illustrative.
 */
export function DocumentStats({ documents }) {
  const totals = documents?.totals ?? null;
  const index = documents?.index ?? null;

  const stats = [
    { label: "Documents", value: totals?.documents },
    { label: "Chunks", value: totals?.chunks },
    { label: "Vectors", value: totals?.vectors ?? index?.vectors },
    { label: "Dimensions", value: index?.dimension },
    { label: "PDF sources", value: totals?.pdf_documents },
    { label: "Text sources", value: totals?.text_documents },
    { label: "Wells referenced", value: totals?.wells_referenced }
  ];

  return (
    <div className="doc-stats">
      {stats.map((stat) => (
        <div className="doc-stat" key={stat.label}>
          <span className="doc-stat__value">
            {isNum(stat.value) ? stat.value : "—"}
          </span>
          <span className="doc-stat__label">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

export default DocumentViewer;
