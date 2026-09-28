import { memo } from "react";

import { RISK_BANDS } from "../../lib/risk.js";

/**
 * The four severity bands with their exact numeric ranges.
 * The occupied band is highlighted; the others stay visible
 * so the operator can see how much headroom is left.
 */
function RiskLadderBase({ activeLevel, riskHistory = [] }) {
  const active = String(activeLevel ?? "").toLowerCase();
  const peak =
    riskHistory.length > 0 ? Math.max(...riskHistory) : null;

  return (
    <div className="ladder" role="list" aria-label="Risk severity bands">
      {RISK_BANDS.map((band) => {
        const isActive = band.level.toLowerCase() === active;
        const reached = peak !== null && peak >= band.min;

        return (
          <div
            key={band.level}
            role="listitem"
            className="ladder__band"
            data-active={isActive}
            data-sev={band.key}
            style={{ "--band-color": band.color }}
            title={`${band.level}: ${band.range} — ${band.meaning}`}
          >
            <span className="ladder__band-name">
              {isActive ? "▸ " : ""}
              {band.level}
            </span>
            <span className="ladder__band-range">
              {band.range}
              {reached && !isActive ? " · seen" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const RiskLadder = memo(RiskLadderBase);
export default RiskLadder;
