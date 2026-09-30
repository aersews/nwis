import { memo } from "react";

import { isNum, km, label as fmtLabel, num } from "../../lib/format.js";
import { IconInfo } from "../common/Icons.jsx";

/**
 * WHY THIS WELL?
 *
 * Every bar is one term of the sum that produced the
 * well's relevance score, shown at its own weight rather
 * than renormalised — so the reader can see both how strong
 * the match is and how much that term is allowed to matter.
 *
 * A factor whose underlying attribute was never recorded
 * renders as "Not available" with no bar. It is not scored
 * as zero, because an unrecorded attribute is not a
 * mismatching one.
 */
function OffsetFactorsBase({
  offset,
  activeWell,
  showDistance = true,
  compact = false
}) {
  const factors = offset?.factors ?? null;

  if (!factors) {
    return null;
  }

  const order =
    offset?.factor_order ??
    Object.keys(factors);

  const available = order.filter(
    (key) => factors[key]?.available
  );

  const unavailable = order.filter(
    (key) => !factors[key]?.available
  );

  return (
    <div className={`ofactors${compact ? " ofactors--compact" : ""}`}>
      {showDistance ? (
        <div className="ofactors__distance">
          <span className="label">Distance</span>
          <b className="mono">{km(offset?.distance_km)}</b>
          {isNum(offset?.distance_km) ? (
            <span className="label">
              {isNum(offset?.historical_event_count)
                ? `${offset.historical_event_count} historical event${
                    offset.historical_event_count === 1 ? "" : "s"
                  }`
                : null}
            </span>
          ) : null}
        </div>
      ) : null}

      <ul className="ofactors__list">
        {available.map((key) => {
          const factor = factors[key];
          const pct = (factor.similarity ?? 0) * 100;

          return (
            <li
              className="ofactor"
              key={key}
              title={factor.detail}
            >
              <span className="ofactor__label">
                {factor.label}
              </span>
              <span
                className="ofactor__track"
                role="img"
                aria-label={`${factor.label}: ${num(pct, 0)} percent, weighted ${num(
                  (factor.weight ?? 0) * 100,
                  0
                )} percent of the score`}
              >
                <span
                  className="ofactor__cells"
                  aria-hidden="true"
                >
                  {Array.from({ length: 10 }, (_, index) => (
                    <i
                      key={index}
                      className={
                        index < Math.round(pct / 10)
                          ? "ofactor__cell is-on"
                          : "ofactor__cell"
                      }
                    />
                  ))}
                </span>
              </span>
              <span className="ofactor__value mono">
                {num(pct, 0)}%
              </span>
              <span className="ofactor__weight mono">
                ×{num((factor.weight ?? 0) * 100, 0)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="ofactors__total">
        <span className="label">Overall relevance</span>
        <b className="mono">
          {isNum(offset?.similarity_score)
            ? num(offset.similarity_score, 1)
            : "Not available"}
          {isNum(offset?.similarity_score)
            ? " / 100"
            : ""}
        </b>
      </div>

      {unavailable.length > 0 ? (
        <p className="note">
          <IconInfo size={13} className="note__icon" />
          <span>
            Not available for this well:{" "}
            {unavailable
              .map((key) => factors[key].label)
              .join(", ")}
            . These attributes are not recorded in the dataset, so
            no score is claimed for them.
          </span>
        </p>
      ) : null}

      <details className="disclosure">
        <summary className="disclosure__summary">
          What each factor was measured from
        </summary>
        <div className="disclosure__content">
          <dl className="deflist deflist--tight">
            {available.map((key) => (
              <div className="deflist__row" key={key}>
                <dt className="deflist__key">
                  {factors[key].label}
                </dt>
                <dd className="deflist__val">
                  {fmtLabel(factors[key].detail)}
                </dd>
              </div>
            ))}
          </dl>
          {activeWell ? (
            <span>
              All factors are relative to{" "}
              <strong>{fmtLabel(activeWell)}</strong>.
            </span>
          ) : null}
        </div>
      </details>
    </div>
  );
}

export const OffsetFactors = memo(OffsetFactorsBase);
export default OffsetFactors;
