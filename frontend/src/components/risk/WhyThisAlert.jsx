import { memo } from "react";

import {
  PRECURSOR_RULE_TEXT,
  SIGNALS,
  bandForScore,
  formatSignalDelta,
  signalDelta,
  signalForReason
} from "../../lib/risk.js";
import {
  IconAlert,
  IconCheck,
  IconInfo,
  IconHistory,
  IconArrowRight
} from "../common/Icons.jsx";
import { label as fmtLabel, metres, num } from "../../lib/format.js";

/* Saturation points are the denominators used by
   ml/risk_engine.calculate_risk — a signal at or above its
   saturation point contributes its full weight to the score. */
const SATURATION = {
  rop: 30,
  torque: 50,
  ecd: 0.1,
  pit_volume: 8
};

function SignalTile({ signal, value }) {
  const saturation = SATURATION[signal.key];
  const ratio =
    typeof value === "number" && saturation
      ? Math.max(0, Math.min(100, (Math.abs(value) / saturation) * 100))
      : 0;
  const band = bandForScore(ratio);
  const display = formatSignalDelta(signal.key, {
    rop_drop: value,
    torque_rise: value,
    ecd_rise: value,
    pit_drop: value
  });

  return (
    <div
      className="signal-tile"
      title={`${signal.longName}: ${display ?? "not reported"} — saturates the risk contribution at ${
        SATURATION[signal.key]
      }${signal.key === "ecd" ? " sg" : "%"}`}
    >
      <span className="signal-tile__name">{signal.name}</span>
      <span className="signal-tile__bar">
        <span
          className="signal-tile__fill"
          style={{ width: `${ratio}%`, "--tile-color": band.color }}
        />
      </span>
      <span className="signal-tile__value">{display ?? "—"}</span>
    </div>
  );
}

/**
 * "Why this alert?" — the single most-read panel on the screen.
 * It states the trigger, the contributing signal, the historical
 * correlation and the basis, in that order, with a link into the
 * full rationale.
 */
function WhyThisAlertBase({ contextual, liveFrame, onOpenRationale }) {
  const risk = contextual?.risk ?? null;
  const reasons =
    risk?.reasons?.length > 0
      ? risk.reasons
      : (liveFrame?.warnings ?? []).length > 0
        ? liveFrame.warnings
        : [];

  const historical = contextual?.historical_events ?? [];
  const documents = contextual?.document_evidence ?? [];
  const signals = risk?.signals ?? null;
  const maxDelta = historical.reduce(
    (max, event) =>
      Math.max(max, Math.abs(event?.depth_difference ?? 0)),
    0
  );

  const band = risk?.level
    ? bandForScore(risk.score).key
    : "low";

  return (
    <>
      <div className="reasons">
        {reasons.map((reason) => {
          const signal = signalForReason(reason);
          const delta = signal
            ? formatSignalDelta(signal.key, signals)
            : null;
          const rule = PRECURSOR_RULE_TEXT[reason];
          const calm = reason.startsWith("No significant");

          return (
            <div
              className={`reason${calm ? " reason--calm" : ""}`}
              key={reason}
              data-sev={calm ? "low" : "medium"}
              title={rule ?? undefined}
            >
              <span className="reason__glyph" aria-hidden="true">
                {calm ? <IconCheck size={13} /> : <IconAlert size={13} />}
              </span>
              <span className="reason__text">
                {reason}
                {rule ? (
                  <span
                    style={{
                      display: "block",
                      fontSize: "var(--fs-label)",
                      color: "var(--text-faint)",
                      letterSpacing: "0.02em",
                      marginTop: 2
                    }}
                  >
                    {rule}
                  </span>
                ) : null}
              </span>
              <span className="reason__delta">
                {delta ?? (calm ? "—" : "•")}
              </span>
            </div>
          );
        })}

        {historical.length > 0 ? (
          <div className="reason reason--info" data-sev="info">
            <span className="reason__glyph" aria-hidden="true">
              <IconHistory size={13} />
            </span>
            <span className="reason__text">
              {historical.length} historical event
              {historical.length === 1 ? "" : "s"} inside the ±50 m depth
              window
              <span
                style={{
                  display: "block",
                  fontSize: "var(--fs-label)",
                  color: "var(--text-faint)",
                  marginTop: 2
                }}
              >
                {historical
                  .map(
                    (e) =>
                      `${e.well_id} ${fmtLabel(e.event).toUpperCase()} at ${num(
                        e.historical_depth,
                        0
                      )} m`
                  )
                  .join(" · ")}
              </span>
            </span>
            <span className="reason__delta">
              {historical.length > 0 ? `−${num(maxDelta, 0)} m` : ""}
            </span>
          </div>
        ) : (
          <div className="reason reason--empty" data-sev="none">
            <span className="reason__glyph" aria-hidden="true">
              <IconInfo size={13} />
            </span>
            <span className="reason__text">
              No historical event recorded within ±50 m of the current bit
              depth in this formation
            </span>
            <span className="reason__delta">0</span>
          </div>
        )}

        {documents.length > 0 ? (
          <div className="reason reason--info" data-sev="info">
            <span className="reason__glyph" aria-hidden="true">
              <IconInfo size={13} />
            </span>
            <span className="reason__text">
              {documents.length} historical document
              {documents.length === 1 ? "" : "s"} retrieved by semantic search
              <span
                style={{
                  display: "block",
                  fontSize: "var(--fs-label)",
                  color: "var(--text-faint)",
                  marginTop: 2
                }}
              >
                {documents
                  .map((d) => d?.metadata?.source)
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="reason__delta">
              {documents.length > 0 ? "ranked" : "—"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="wwb">
        <div className="wwb__row">
          <span className="wwb__key">What</span>
          <span className="wwb__value" data-sev={band}>
            {risk?.contextual_event
              ? `Elevated ${fmtLabel(risk.contextual_event).toLowerCase()} risk`
              : "No dominant historical event in window"}
          </span>
        </div>
        <div className="wwb__row">
          <span className="wwb__key">Why</span>
          <span className="wwb__value">
            {reasons.length > 0
              ? reasons.join(" · ")
              : "No rolling-window precursor crossed"}
          </span>
        </div>
        <div className="wwb__row">
          <span className="wwb__key">Based on</span>
          <span className="wwb__value">
            {historical.length} historical event
            {historical.length === 1 ? "" : "s"} · {documents.length} document
            {documents.length === 1 ? "" : "s"} · bit depth{" "}
            <span className="mono">
              {metres(contextual?.well?.depth, 0, "—")}
            </span>
          </span>
        </div>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "var(--s-3)"
          }}
        >
          <span className="label">Signal contribution</span>
          <span
            className="label"
            style={{ color: "var(--text-faint)", letterSpacing: "0.08em" }}
          >
            Share of score at saturation
          </span>
        </div>
        {SIGNALS.map((signal) => (
          <SignalTile
            key={signal.key}
            signal={signal}
            value={signalDelta(signal.key, signals)}
          />
        ))}
      </div>

      {onOpenRationale ? (
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onOpenRationale}
          style={{ alignSelf: "flex-start" }}
        >
          Full alert rationale
          <IconArrowRight size={13} />
        </button>
      ) : null}
    </>
  );
}

export const WhyThisAlert = memo(WhyThisAlertBase);
export default WhyThisAlert;
