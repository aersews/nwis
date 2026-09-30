import { memo } from "react";

import { isNum, label as fmtLabel, num } from "../../lib/format.js";
import { bandForScore } from "../../lib/risk.js";
import { IconInfo } from "../common/Icons.jsx";

/**
 * RISK CONTRIBUTOR BREAKDOWN
 *
 * The bars below the headline number are the same
 * `weight x normalised adverse change` products the engine
 * summed to produce it — not a re-derivation in the browser.
 * The historical bonus is included as its own bar, so the
 * column always adds up to the index shown above it. The
 * backend asserts that identity (`contributors_reconcile`);
 * if it ever failed, the panel says so instead of quietly
 * displaying numbers that do not add up.
 */
function RiskContributorsBase({ risk, liveScore }) {
  const contributors = risk?.contributors ?? [];

  if (contributors.length === 0) {
    return null;
  }

  const total = isNum(risk?.contributors_total)
    ? risk.contributors_total
    : null;

  const headline =
    liveScore ?? risk?.score ?? null;

  const reconciles = risk?.contributors_reconcile !== false;

  const maxPoints = Math.max(
    ...contributors.map((c) => isNum(c.max_points) ? c.max_points : 0),
    total ?? 0,
    1
  );

  return (
    <div className="contrib">
      <div className="contrib__head">
        <span className="label">Risk contributor breakdown</span>
        <span
          className="label"
          style={{ letterSpacing: "0.08em" }}
        >
          {isNum(total) ? `${num(total, 1)} of ${num(headline, 1)}` : "—"}
          {liveScore !== null && liveScore !== undefined
            ? " contextual"
            : " signal"}
        </span>
      </div>

      <ul className="contrib__list">
        {contributors.map((contributor) => {
          const points = isNum(contributor.points)
            ? contributor.points
            : null;

          const share = isNum(points)
            ? (points / maxPoints) * 100
            : 0;

          const band = points === null
            ? null
            : bandForScore(
                (points / (contributor.max_points || 100)) * 100
              );

          const saturated = contributor.at_saturation === true;

          return (
            <li
              className="cbar"
              key={contributor.key}
              data-sev={
                saturated
                  ? "critical"
                  : contributor.threshold_crossed
                    ? "medium"
                    : "low"
              }
              title={contributor.detail}
            >
              <span className="cbar__label">
                {contributor.label}
                {saturated ? (
                  <span
                    className="cbar__sat"
                    title="This signal has reached its saturation point and cannot add further points"
                  >
                    saturated
                  </span>
                ) : null}
              </span>

              <span className="cbar__track">
                <span
                  className="cbar__fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, share))}%`,
                    "--cbar-color": band?.color ?? "var(--neutral)"
                  }}
                />
              </span>

              <span className="cbar__value mono">
                {points === null
                  ? "—"
                  : `+${num(points, 1)}`}
                {isNum(contributor.max_points) ? (
                  <small> / {num(contributor.max_points, 0)}</small>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {!reconciles ? (
        <p className="note note--warn">
          <IconInfo size={13} className="note__icon" />
          <span>
            The backend reports that these contributions do not
            reconstruct the headline index. The panel is showing
            the engine output verbatim rather than a corrected
            figure.
          </span>
        </p>
      ) : null}

      <details className="disclosure">
        <summary className="disclosure__summary">
          Thresholds and saturation points
        </summary>
        <div className="disclosure__content">
          <div className="table-scroll">
            <table className="mini-table">
              <thead>
                <tr>
                  <th scope="col">Signal</th>
                  <th scope="col">Observed</th>
                  <th scope="col">Saturation</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Alert threshold</th>
                </tr>
              </thead>
              <tbody>
                {contributors.map((contributor) => (
                  <tr key={contributor.key}>
                    <th scope="row">{contributor.label}</th>
                    <td className="mono">
                      {isNum(contributor.observed)
                        ? `${num(contributor.observed, contributor.unit === "sg" ? 2 : 0)}${
                            contributor.unit === "sg" ? " sg" : "%"
                          }`
                        : fmtLabel(contributor.observed)}
                    </td>
                    <td className="mono">
                      {isNum(contributor.saturation_in_unit)
                        ? `${num(
                            contributor.saturation_in_unit,
                            contributor.unit === "sg" ? 2 : 0
                          )}${contributor.unit === "sg" ? " sg" : "%"}`
                        : "—"}
                    </td>
                    <td className="mono">
                      {isNum(contributor.weight)
                        ? `${num(contributor.weight * 100, 0)}%`
                        : "—"}
                    </td>
                    <td>{contributor.threshold_text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span>
            A signal at its saturation point contributes its full
            weight and cannot add further points. Crossing the alert
            threshold is what adds the reason to the panel — it is
            independent of how much the signal contributes.
          </span>
        </div>
      </details>
    </div>
  );
}

export const RiskContributors = memo(RiskContributorsBase);
export default RiskContributors;
