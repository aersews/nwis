import { memo } from "react";

import { Badge } from "../common/Badge.jsx";
import {
  IconAlert,
  IconShieldAlert,
  IconInfo,
  IconRefresh
} from "../common/Icons.jsx";
import { label as fmtLabel, num } from "../../lib/format.js";
import { RISK_BANDS, bandForLevel, bandForScore } from "../../lib/risk.js";
import { RiskMeter } from "./RiskMeter.jsx";
import { RiskLadder } from "./RiskLadder.jsx";

/**
 * PRIMARY RISK SURFACE.
 *
 * Two indices, never blended, because the backend produces two
 * different things:
 *
 *   · Live signal index — /api/simulation or the WebSocket. Moves
 *     with the current parameters. This is the number an operator
 *     reacts to right now.
 *   · Contextual index — /api/nwis. The same signal risk plus a
 *     historical corroboration bonus for events inside the depth
 *     window. This is the number that explains the escalation.
 *
 * Neither is a probability. The panel says so on the surface.
 */
function RiskPanelBase({
  contextual,
  liveFrame,
  loading,
  error,
  onRetry,
  riskHistory = []
}) {
  const risk = contextual?.risk ?? null;
  const live = liveFrame?.risk ?? null;

  const liveScore = live?.score ?? null;
  const liveLevel = live?.level ?? null;
  const contextualScore = risk?.score ?? null;
  const contextualLevel = risk?.level ?? null;

  const headlineScore = liveScore ?? contextualScore;
  const headlineLevel = liveLevel ?? contextualLevel ?? "LOW";
  const band = bandForLevel(headlineLevel) ?? bandForScore(headlineScore ?? 0);
  const contextualBand = bandForLevel(contextualLevel);

  const event = risk?.contextual_event ?? risk?.predicted_event ?? null;
  const bandMeaning =
    RISK_BANDS.find((b) => b.level === band?.level)?.meaning ?? "";

  const historicalBonus = (() => {
    if (!risk || !Number.isFinite(risk.score) || !Number.isFinite(liveScore)) {
      return null;
    }
    return risk.score - liveScore;
  })();

  if (error && !contextual) {
    return (
      <div className="risk" data-sev="critical">
        <div className="state state--error state--tight state--inline" role="alert">
          <span className="state__icon" aria-hidden="true">
            <IconAlert size={16} />
          </span>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minWidth: 0
            }}
          >
            <p className="state__title">Risk intelligence unavailable</p>
            <p className="state__text">{error}</p>
            {onRetry ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={onRetry}
                style={{ alignSelf: "flex-start" }}
              >
                <IconRefresh size={12} />
                Retry intelligence
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="risk" data-sev={band?.key ?? "low"}>
      <div className="risk__top">
        <div className="risk__identity">
          <span className="label label--sev">
            {liveScore !== null ? "Live signal index" : "Contextual risk index"}
          </span>
          <div className="risk__level">
            {band?.key === "critical" || band?.key === "high" ? (
              <IconShieldAlert size={20} style={{ color: "var(--sev)" }} />
            ) : (
              <IconInfo size={20} style={{ color: "var(--sev)" }} />
            )}
            {fmtLabel(headlineLevel, "—")}
          </div>
          <p className="risk__headline" role="status" aria-live="polite">
            {liveScore !== null
              ? event
                ? (
                    <>
                      Precursors consistent with{" "}
                      <em>{fmtLabel(event).toUpperCase()}</em> at{" "}
                      {num(liveFrame?.depth ?? contextual?.well?.depth, 0)} m
                    </>
                  )
                : "Parameters remain inside the expected envelope"
              : event
                ? (
                    <>
                      Historical context points to{" "}
                      <em>{fmtLabel(event).toUpperCase()}</em> at{" "}
                      {num(contextual?.well?.depth, 0)} m
                    </>
                  )
                : "Stream idle — awaiting the first telemetry sample"}
          </p>
        </div>

        <div className="risk__score">
          <span className="risk__score-value">
            {loading && headlineScore === null
              ? "—"
              : num(headlineScore, headlineScore >= 10 ? 0 : 1, "—")}
          </span>
          <span className="risk__score-max">/100</span>
        </div>
      </div>

      <RiskMeter score={headlineScore ?? 0} />

      <div
        style={{
          display: "flex",
          gap: "var(--s-5)",
          flexWrap: "wrap",
          alignItems: "center"
        }}
      >
        <Badge severity={band?.key} large pulse={band?.key === "critical"}>
          {fmtLabel(headlineLevel, "—")}
        </Badge>
        {bandMeaning ? (
          <span className="muted" style={{ fontSize: "var(--fs-xs)" }}>
            {bandMeaning}
          </span>
        ) : null}
      </div>

      <RiskLadder activeLevel={headlineLevel} riskHistory={riskHistory} />

      <div className="kv">
        <div className="kv__cell">
          <span className="kv__label">
            {liveScore !== null ? "Contextual index" : "Live signal index"}
          </span>
          <span
            className={`kv__value${
              contextualBand?.key === band?.key ? "" : " kv__value--sev"
            }`}
            data-sev={contextualBand?.key ?? "none"}
          >
            {loading && contextualScore === null ? "—" : num(contextualScore, 1, "—")}
            {contextualScore !== null ? <small> /100</small> : null}
          </span>
        </div>
        <div className="kv__cell">
          <span className="kv__label">Historical bonus</span>
          <span className="kv__value">
            {Number.isFinite(historicalBonus)
              ? `+${num(Math.max(0, historicalBonus), 0)}`
              : "—"}
            <small> pts</small>
          </span>
        </div>        <div className="kv__cell">
          <span className="kv__label">Precursors crossed</span>
          <span className="kv__value">
            {risk?.reasons?.length ?? 0}
            <small> / 4</small>
          </span>
        </div>
        <div className="kv__cell">
          <span className="kv__label">Contextual alert</span>
          <span
            className="kv__value"
            data-sev={contextual?.alert?.triggered ? "critical" : "none"}
          >
            {contextual?.alert?.triggered ? "RAISED" : "CLEAR"}
          </span>
        </div>
      </div>

      {contextual?.alert?.message ? (
        <p
          style={{
            fontSize: "var(--fs-sm)",
            color: "var(--text)",
            lineHeight: 1.5,
            borderLeft: "2px solid var(--info)",
            paddingLeft: "var(--s-5)"
          }}
        >
          <strong style={{ color: "var(--info)", fontSize: "var(--fs-label)", letterSpacing: "0.12em", display: "block" }}>
            BACKEND ALERT · {fmtLabel(contextual.alert.severity).toUpperCase()}
          </strong>
          {contextual.alert.message}
        </p>
      ) : null}

      {liveScore === null ? (
        <div className="banner banner--info" style={{ padding: "var(--s-4) var(--s-5)" }}>
          <IconInfo size={14} className="banner__icon" />
          <div className="banner__body">
            <span className="banner__title">No live parameter frame yet</span>
            <span className="banner__text">
              The figure above is the contextual index for the current bit
              position, computed from the demonstration precursor record.
              Start the sequence to stream live parameters and watch the
              signal index move.
            </span>
          </div>
        </div>
      ) : null}

      <p className="note">
        <IconInfo size={13} className="note__icon" />
        <span>
          Explainable index, <strong>not a probability of failure</strong>.
          The contextual index adds up to 15 points for historical
          corroboration inside the depth window. In this demonstration the
          backend applies a fixed degraded precursor record when scoring
          the contextual index, so that figure saturates while the live
          signal index tracks the streamed parameters.
        </span>
      </p>
    </div>
  );
}

export const RiskPanel = memo(RiskPanelBase);
export default RiskPanel;
