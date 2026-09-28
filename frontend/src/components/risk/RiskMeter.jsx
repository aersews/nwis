import { memo } from "react";

import { RISK_BANDS, bandForScore } from "../../lib/risk.js";

const SEGMENTS = 28;

function scoreColor(segmentIndex) {
  const value = (segmentIndex / (SEGMENTS - 1)) * 100;
  return bandForScore(value).color;
}

/**
 * Segmented 0–100 index with the backend's real thresholds
 * marked on the axis, so a score is always readable against
 * the band boundaries rather than against a vague gradient.
 */
function RiskMeterBase({ score, liveScore }) {
  const band = bandForScore(score);
  const value = Math.max(0, Math.min(100, score ?? 0));
  const filled = Math.round((value / 100) * SEGMENTS);

  return (
    <div className="meter">
      <div
        className="meter__track"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${Math.round(value)} of 100 — ${band.level}`}
        aria-label="Contextual risk index"
      >
        {Array.from({ length: SEGMENTS }).map((_, index) => (
          <span
            key={index}
            className={`meter__seg${index < filled ? " is-on" : ""}`}
            style={
              index < filled
                ? { "--seg-color": scoreColor(index) }
                : undefined
            }
          />
        ))}
        <i
          className="meter__needle"
          style={{ left: `calc(${(value / 100) * 100}% - 1px)` }}
        />
      </div>

      <div className="meter__thresholds" aria-hidden="true">
        {RISK_BANDS.filter((b) => b.min > 0).map((b) => (
          <span
            key={b.level}
            className="meter__threshold"
            style={{ left: `${b.min}%` }}
          >
            {b.min}
          </span>
        ))}
      </div>

      <div className="meter__scale" aria-hidden="true">
        <span>0</span>
        <span>100</span>
      </div>

      <span className="sr-only">
        {liveScore !== undefined && liveScore !== null
          ? `Live signal index ${Math.round(liveScore)} of 100.`
          : ""}
      </span>
    </div>
  );
}

export const RiskMeter = memo(RiskMeterBase);
export default RiskMeter;
