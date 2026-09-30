import { memo } from "react";

import {
  isNum,
  label as fmtLabel,
  num
} from "../../lib/format.js";
import { severityFromHistorical } from "../../lib/risk.js";
import { IconHistory, IconInfo, IconSignal } from "../common/Icons.jsx";

/**
 * WHY NOW?
 *
 * The panel that answers the only question that matters at
 * 3 a.m.: why is this firing *right now*?
 *
 * Everything on it is a value the backend computed:
 * the arrow direction is the sign of the measured change,
 * the percentage is the measured change, the historical
 * count is what the depth-window query returned, and the
 * summary sentence is assembled from those same numbers in
 * backend/why_now.py. Nothing is restated or re-derived
 * here.
 */
function WhyNowBase({ whyNow, liveFrame, currentDepth }) {
  if (!whyNow) {
    return (
      <div className="state state--tight state--info">
        <span className="state__icon" aria-hidden="true">
          <IconSignal size={16} />
        </span>
        <p className="state__title">Why-now explanation unavailable</p>
        <p className="state__text">
          The contextual explanation has not been returned for
          this bit position.
        </p>
      </div>
    );
  }

  const signals = whyNow.signals ?? [];
  const historical = whyNow.historical ?? {};
  const nearest = historical.nearest ?? null;

  const depth =
    currentDepth ??
    liveFrame?.depth ??
    whyNow.current_depth ??
    null;

  const severity = whyNow.convergence ? "high" : "low";

  return (
    <div className="whynow" data-sev={severity}>
      <header className="whynow__head">
        <span className="label label--sev">
          Why now?
        </span>
        <span className="whynow__depth">
          <span className="label">Current depth</span>
          <b className="mono">{num(depth, 0)} m</b>
          <span className="label">{fmtLabel(whyNow.formation)}</span>
        </span>
      </header>

      <div
        className="whynow__summary"
        role="status"
        aria-live="polite"
      >
        {whyNow.summary}
      </div>

      <div className="whynow__grid">
        <section className="whynow__block">
          <div className="whynow__block-head">
            <IconSignal size={12} />
            <span className="label">Current signals</span>
            <span className="whynow__count">
              {whyNow.adverse_signal_count ?? 0} adverse
            </span>
          </div>

          <ul className="whynow__signals">
            {signals.map((signal) => (
              <li
                key={signal.key}
                className="wsignal"
                data-sev={
                  signal.adverse ? "high" : "low"
                }
                title={
                  signal.available
                    ? `${signal.name}: ${num(
                        signal.baseline,
                        2
                      )} → ${num(signal.current, 2)} ${signal.unit ?? ""} (${
                        signal.change_pct >= 0 ? "+" : "−"
                      }${num(Math.abs(signal.change_pct), 1)}%)`
                    : "Not available"
                }
              >
                <span className="wsignal__name">
                  {signal.name}
                </span>
                <span className="wsignal__arrow">
                  {signal.arrow ?? "—"}
                </span>
                <span className="wsignal__value mono">
                  {isNum(signal.change_pct)
                    ? `${signal.change_pct >= 0 ? "+" : "−"}${num(
                        Math.abs(signal.change_pct),
                        0
                      )}%`
                    : "Not available"}
                </span>
                <span className="wsignal__raw mono">
                  {isNum(signal.current)
                    ? `${num(signal.current, signal.key === "ecd" ? 3 : 1)} ${signal.unit ?? ""}`
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="whynow__block">
          <div className="whynow__block-head">
            <IconHistory size={12} />
            <span className="label">Historical context</span>
            <span className="whynow__count">
              {historical.count ?? 0} within ±
              {historical.window_m ?? 50} m
            </span>
          </div>

          {nearest ? (
            <div className="whynow__nearest">
              <div className="whynow__nearest-row">
                <span className="label">Closest event</span>
                <b>{fmtLabel(nearest.well_id)}</b>
                <span
                  data-sev={
                    severityFromHistorical(nearest.severity)
                  }
                >
                  {fmtLabel(nearest.event)}
                </span>
              </div>
              <dl className="deflist deflist--tight">
                <div className="deflist__row">
                  <span className="deflist__key">Event depth</span>
                  <span className="deflist__val mono">
                    {num(nearest.historical_depth, 0)} m
                  </span>
                </div>
                <div className="deflist__row">
                  <span className="deflist__key">
                    Depth difference
                  </span>
                  <span className="deflist__val mono">
                    −{num(nearest.depth_difference, 0)} m
                  </span>
                </div>
                <div className="deflist__row">
                  <span className="deflist__key">Severity</span>
                  <span className="deflist__val">
                    {fmtLabel(nearest.severity)}
                  </span>
                </div>
              </dl>
            </div>
          ) : (
            <p className="whynow__none">
              No historical event of this formation lies inside the
              ±{historical.window_m ?? 50} m window at this bit
              position. The alert rests on current behaviour alone.
            </p>
          )}
        </section>
      </div>

      <details className="disclosure">
        <summary className="disclosure__summary">
          How this sentence was produced
        </summary>
        <div className="disclosure__content">
          <span>Clause by clause, from measured values:</span>
          <ol className="whynow__clauses">
            {(whyNow.clauses ?? []).map((clause, index) => (
              <li key={clause}>
                <span className="whynow__clause-index mono">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {clause}
              </li>
            ))}
            {(whyNow.clauses ?? []).length === 0 ? (
              <li>No clause qualified; the summary states the absence.</li>
            ) : null}
          </ol>
          <div className="kv kv--inline">
            <div className="kv__cell">
              <span className="kv__label">Signal source</span>
              <span className="kv__value">
                {fmtLabel(whyNow.signal_source)}
              </span>
            </div>
            <div className="kv__cell">
              <span className="kv__label">Convergence</span>
              <span className="kv__value">
                {whyNow.convergence ? "DETECTED" : "NOT DETECTED"}
              </span>
            </div>
          </div>
          <p className="note">
            <IconInfo size={13} className="note__icon" />
            <span>
              {whyNow.interpretation?.convergence}
            </span>
          </p>
        </div>
      </details>
    </div>
  );
}

export const WhyNow = memo(WhyNowBase);
export default WhyNow;
