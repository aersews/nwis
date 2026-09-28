import { useMemo } from "react";

import { Modal } from "../common/Modal.jsx";
import { Badge, ConfidenceBadge } from "../common/Badge.jsx";
import { DecisionSupportNotice } from "../recommendation/RecommendationPanel.jsx";
import {
  SIGNALS,
  bandForScore,
  formatSignalDelta,
  severityKey,
  signalAdverse,
  signalDelta
} from "../../lib/risk.js";
import { isNum, km, label as fmtLabel, num, similarity } from "../../lib/format.js";
import {
  IconActivity,
  IconFile,
  IconHistory,
  IconInfo,
  IconSearch
} from "../common/Icons.jsx";

function Block({ icon, title, children, aside }) {
  return (
    <section className="drawer__section">
      <div className="drawer__section-head">
        {icon}
        <span className="label">{title}</span>
        <span className="panel__spacer" />
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * "Why did NWIS trigger this?" — the complete audit trail for a
 * single alert, from live signal to source document.
 */
export function AlertDetailModal({
  open,
  onClose,
  entry,
  contextual,
  liveFrame,
  onViewSource,
  onOpenWell
}) {
  const risk = contextual?.risk ?? null;
  const events = contextual?.historical_events ?? [];
  const documents = contextual?.document_evidence ?? [];
  const recommendation = contextual?.recommendation ?? null;
  const signals = risk?.signals ?? null;
  const liveSignals = liveFrame?.signals ?? null;

  const level = entry?.severity ?? risk?.level ?? liveFrame?.risk?.level ?? "LOW";
  const band = bandForScore(risk?.score ?? liveFrame?.risk?.score ?? 0);

  const rows = useMemo(
    () =>
      SIGNALS.map((signal) => {
        const live = liveSignals?.[signal.key];
        const delta = formatSignalDelta(signal.key, signals);
        return {
          signal,
          live,
          delta,
          adverse:
            isNum(live) && signalAdverse(signal, live)
              ? true
              : isNum(signalDelta(signal.key, signals))
          };
      }),
    [signals, liveSignals]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={entry ? entry.clock : "Alert rationale"}
      severity={band.key}
      title="Why did NWIS trigger this?"
      tools={
        <>
          {entry ? (
            <Badge
              severity={
                entry.kind === "level" ? severityKey(entry.severity) : "info"
              }
              large
            >
              {entry.kind === "level"
                ? `Entry · ${fmtLabel(level).toUpperCase()}`
                : `Entry · ${String(entry.kind).toUpperCase()}`}
            </Badge>
          ) : null}
          {isNum(risk?.score) ? (
            <Badge severity={band.key} dot={false}>
              index {num(risk.score, 1)} / 100 · {fmtLabel(contextual?.risk?.level).toUpperCase()}
            </Badge>
          ) : null}
        </>
      }
      actions={
        <>
          <span className="label" style={{ letterSpacing: "0.1em" }}>
            Every value below is returned by the backend — none is inferred
            in the interface
          </span>
        </>
      }
    >
      {entry ? (
        <div className="wwb">
          <div className="wwb__row">
            <span className="wwb__key">Trigger</span>
            <span className="wwb__value" data-sev={band.key}>
              {entry.title}
            </span>
          </div>
          <div className="wwb__row">
            <span className="wwb__key">Observed</span>
            <span className="wwb__value">{entry.detail ?? "—"}</span>
          </div>
          <div className="wwb__row">
            <span className="wwb__key">At</span>
            <span className="wwb__value mono">
              {isNum(liveFrame?.depth) ? `${num(liveFrame.depth, 0)} m` : "—"} ·{" "}
              {fmtLabel(liveFrame?.formation ?? contextual?.well?.formation)}
            </span>
          </div>
        </div>
      ) : null}

      <Block
        icon={<IconActivity size={13} style={{ color: "var(--warn)" }} />}
        title="Current signals"
        aside={
          liveFrame ? (
            <span className="label">streamed at {num(liveFrame.depth, 0)} m</span>
          ) : null
        }
      >
        <div className="kv">
          {rows.map(({ signal, live, delta, adverse }) => (
            <div className="kv__cell" key={signal.key} data-sev={adverse ? "medium" : "none"}>
              <span className="kv__label">{signal.name}</span>
              <span className={`kv__value${adverse ? " kv__value--sev" : ""}`}>
                {isNum(live) ? num(live, signal.digits) : "—"}
                <small> {signal.unit}</small>
              </span>
              <span
                className="label"
                style={{ color: "var(--text-faint)", letterSpacing: "0.06em" }}
              >
                Δ {delta ?? "not reported"}
              </span>
            </div>
          ))}
        </div>
        <div className="deflist">
          {SIGNALS.map((signal) => (
            <div className="deflist__row" key={`rule-${signal.key}`}>
              <span className="deflist__key">{signal.longName}</span>
              <span className="deflist__val" style={{ fontSize: "var(--fs-xs)" }}>
                {signal.warnAbove !== null
                  ? `triggers above ${signal.warnAbove} ${signal.unit}`
                  : `triggers below ${signal.warnBelow} ${signal.unit}`}
              </span>
            </div>
          ))}
        </div>
        <p className="note">
          <IconInfo size={13} className="note__icon" />
          <span>{SIGNALS[0].what}</span>
        </p>
      </Block>

      <Block
        icon={<IconHistory size={13} style={{ color: "var(--info)" }} />}
        title={`Historical correlation · ${events.length}`}
      >
        {events.length === 0 ? (
          <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
            No historical event lies within the configured depth window, so
            the contextual index carries no historical bonus from events.
          </p>
        ) : (
          <div className="well-list" style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-2)" }}>
            {events.map((event, index) => (
              <button
                type="button"
                className="well-row"
                key={`${event.well_id}-${index}`}
                style={{ gridTemplateColumns: "minmax(0,1fr) auto 14px" }}
                onClick={() => {
                  onOpenWell?.(event.well_id);
                  onClose?.();
                }}
              >
                <span className="well-row__id">
                  <strong>{fmtLabel(event.well_id)}</strong>
                  <span>
                    {fmtLabel(event.event).toUpperCase()} · {fmtLabel(event.severity)}
                  </span>
                </span>
                <span className="well-row__stat">
                  <b>{num(event.historical_depth, 0)} m</b> (−
                  {num(event.depth_difference, 1)} m)
                </span>
                <span className="well-row__chevron">›</span>
              </button>
            ))}
          </div>
        )}
        <p className="note">
          <IconInfo size={13} className="note__icon" />
          <span>
            The depth window is fixed at ±50 m by the backend. Offsets and
            their separation:{" "}
            {(contextual?.offsets ?? [])
              .slice(0, 4)
              .map((o) => `${o.well_id} ${km(o.distance_km)}`)
              .join(" · ") || "not ranked"}
          </span>
        </p>
      </Block>

      <Block
        icon={<IconFile size={13} style={{ color: "var(--info)" }} />}
        title={`Document evidence · ${documents.length}`}
      >
        <div className="evidence-list">
          {documents.map((doc, index) => (
            <article className="evidence" data-sev="info" key={doc.id ?? index}>
              <header className="evidence__head">
                <span className="evidence__rank">#{index + 1}</span>
                <span className="evidence__source">
                  {fmtLabel(doc.metadata?.source)}
                </span>
                <span className="evidence__relevance">
                  {similarity(doc.relevance, 1)}
                </span>
              </header>
              <div className="evidence__meta">
                <span className="evidence__field">
                  <span className="evidence__field-label">Well</span>
                  <span className="evidence__field-value">
                    {fmtLabel(doc.metadata?.well_id)}
                  </span>
                </span>
                <span className="evidence__field">
                  <span className="evidence__field-label">Depth</span>
                  <span className="evidence__field-value">
                    {isNum(doc.metadata?.depth)
                      ? `${num(doc.metadata.depth, 0)} m`
                      : "—"}
                  </span>
                </span>
                <span className="evidence__field">
                  <span className="evidence__field-label">Event</span>
                  <span className="evidence__field-value">
                    {fmtLabel(doc.metadata?.event)}
                  </span>
                </span>
              </div>
              <p className="evidence__excerpt" style={{ WebkitLineClamp: 2 }}>
                {doc.text}
              </p>
              <footer className="evidence__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => {
                    onViewSource?.(doc.metadata?.source);
                    onClose?.();
                  }}
                >
                  View source
                </button>
              </footer>
            </article>
          ))}
        </div>

        {contextual?.explainability?.retrieval_query ? (
          <div>
            <span className="label" style={{ display: "block", marginBottom: "var(--s-3)" }}>
              <IconSearch size={10} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
              Retrieval query
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
              {contextual.explainability.retrieval_query}
            </code>
          </div>
        ) : null}

        {contextual?.explainability ? (
          <div className="wwb">
            <div className="wwb__row">
              <span className="wwb__key">Risk source</span>
              <span className="wwb__value">
                {fmtLabel(contextual.explainability.risk_source)}
              </span>
            </div>
            <div className="wwb__row">
              <span className="wwb__key">Historical source</span>
              <span className="wwb__value">
                {fmtLabel(contextual.explainability.historical_source)}
              </span>
            </div>
            <div className="wwb__row">
              <span className="wwb__key">System version</span>
              <span className="wwb__value mono">
                {fmtLabel(contextual.system)} {fmtLabel(contextual.version)}
              </span>
            </div>
          </div>
        ) : null}
      </Block>

      <Block
        icon={<IconActivity size={13} style={{ color: "var(--ok)" }} />}
        title="Recommendation & confidence"
      >
        <p className="reco__quote" style={{ fontSize: "var(--fs-md)" }}>
          {fmtLabel(recommendation?.recommendation, "No recommendation returned")}
        </p>
        <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
          <ConfidenceBadge value={recommendation?.confidence} />
          <Badge severity="info" dot={false}>
            Evidence {recommendation?.evidence_count ?? documents.length} documents
          </Badge>
          <Badge severity="none" dot={false}>
            {fmtLabel(recommendation?.basis, "Basis not stated")}
          </Badge>
        </div>
        <DecisionSupportNotice />
      </Block>
    </Modal>
  );
}

export default AlertDetailModal;
