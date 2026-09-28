import { memo } from "react";

import { Badge, ConfidenceBadge } from "../common/Badge.jsx";
import { num, label as fmtLabel, pluralise } from "../../lib/format.js";
import {
  IconArrowRight,
  IconFile,
  IconInfo,
  IconShieldAlert
} from "../common/Icons.jsx";

/**
 * The recommendation is decision support, never autonomous
 * control. That distinction is rendered in the panel itself,
 * not buried in a footer.
 */
export function DecisionSupportNotice() {
  return (
    <div className="authority">
      <IconShieldAlert size={16} className="authority__icon" />
      <div className="authority__body">
        <span className="authority__title">Decision support — not autonomous control</span>
        <span className="authority__text">
          NWIS surfaces historical context and a suggested line of review. It
          does <strong>not</strong> actuate equipment, change setpoints or
          authorise an operational procedure. The drilling engineer retains
          judgement and authority under the approved drilling programme and
          standing operating procedures.
        </span>
      </div>
    </div>
  );
}

function RecommendationPanelBase({
  contextual,
  liveFrame,
  onViewEvidence,
  onOpenAlert
}) {
  const recommendation = contextual?.recommendation ?? null;
  const text =
    recommendation?.recommendation ??
    (liveFrame
      ? "Continue monitoring current drilling parameters and compare behaviour against historical offset-well evidence."
      : null);

  const evidenceCount =
    recommendation?.evidence_count ??
    contextual?.document_evidence?.length ??
    0;

  const confidence = recommendation?.confidence ?? null;
  const basis = recommendation?.basis ?? null;
  const alert = contextual?.alert ?? null;
  const sources = (contextual?.document_evidence ?? [])
    .map((d) => d?.metadata?.source)
    .filter(Boolean);

  if (!text) {
    return (
      <div className="state state--tight state--info">
        <span className="state__icon" aria-hidden="true">
          <IconInfo size={16} />
        </span>
        <p className="state__title">No recommendation available</p>
        <p className="state__text">
          The recommendation engine runs on retrieved evidence. Once a
          contextual intelligence response arrives, the suggested line of
          review appears here with its evidence count and confidence.
        </p>
      </div>
    );
  }

  return (
    <div className="reco">
      <p className="reco__quote">{text}</p>

      <div className="reco__meta">
        <div className="reco__meta-cell">
          <span className="reco__meta-label">Evidence</span>
          <span className="reco__meta-value">
            {evidenceCount} {pluralise(evidenceCount, "document")}
          </span>
        </div>
        <div className="reco__meta-cell">
          <span className="reco__meta-label">Confidence</span>
          <span className="reco__meta-value">
            {confidence ?? "Not stated"}
          </span>
        </div>
        <div className="reco__meta-cell">
          <span className="reco__meta-label">Basis</span>
          <span className="reco__meta-value">{fmtLabel(basis, "Not stated")}</span>
        </div>
        <div className="reco__meta-cell">
          <span className="reco__meta-label">Target depth</span>
          <span className="reco__meta-value">
            {num(contextual?.well?.depth, 0)} m
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
        <ConfidenceBadge value={confidence} />
        {alert?.triggered ? (
          <Badge severity="critical" large>
            Alert raised
          </Badge>
        ) : (
          <Badge severity="low" large>
            No alert
          </Badge>
        )}
        <span className="label" style={{ alignSelf: "center" }}>
          {fmtLabel(contextual?.risk?.contextual_event, "Monitoring")} pathway
        </span>
      </div>

      {sources.length > 0 ? (
        <div>
          <span className="label" style={{ display: "block", marginBottom: "var(--s-4)" }}>
            <IconFile size={10} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
            Documents behind this recommendation
          </span>
          <div className="pill-row">
            {sources.map((source, index) => (
              <button
                key={`${source}-${index}`}
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => onViewEvidence?.(source)}
                title="Open the source document"
              >
                {fmtLabel(source)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "var(--s-3)", flexWrap: "wrap" }}>
        {onOpenAlert ? (
          <button type="button" className="btn" onClick={onOpenAlert}>
            Why this alert
            <IconArrowRight size={13} />
          </button>
        ) : null}
        {onViewEvidence ? (
          <button type="button" className="btn btn--ghost" onClick={() => onViewEvidence(sources[0])}>
            Inspect evidence
          </button>
        ) : null}
      </div>

      <DecisionSupportNotice />
    </div>
  );
}

export const RecommendationPanel = memo(RecommendationPanelBase);
export default RecommendationPanel;
