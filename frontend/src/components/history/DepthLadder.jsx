import { memo, useMemo } from "react";

import { isNum, label as fmtLabel, num } from "../../lib/format.js";
import { severityFromHistorical } from "../../lib/risk.js";

/* Minimum vertical room for one event card on the depth axis. */
const MIN_ROW_PX = 68;
import {
  IconArrowDown,
  IconDepth,
  IconRuler
} from "../common/Icons.jsx";

/**
 * Depth correlation made visual: the bit position and every
 * matching historical event placed on one shared measured
 * depth axis, so "14 m below the event" is a distance you can
 * see rather than a number you have to compute.
 */
function DepthLadderBase({ currentDepth, windowMetres, events, onSelectWell, similarityByWell }) {
  const anchor = isNum(currentDepth) ? currentDepth : null;

  const { min, max, ticks } = useMemo(() => {
    const anchor = isNum(currentDepth) ? currentDepth : 0;
    const depths = events
      .map((e) => e?.historical_depth)
      .filter(isNum);

    const lowest = depths.length ? Math.min(...depths) : anchor;
    const highest = depths.length ? Math.max(...depths) : anchor;

    /* The axis has to contain the ±window band as well as the
       events, otherwise the band renders off the top of the plot
       and stops being readable. */
    const bandLow = anchor - windowMetres;
    const bandHigh = anchor + windowMetres;

    const lo = Math.floor((Math.min(lowest, bandLow) - 12) / 10) * 10;
    const hi = Math.ceil((Math.max(highest, bandHigh) + 12) / 10) * 10;

    /* Pick the finest step that still keeps the axis readable:
       enough ticks to read a depth off, not so many that the
       labels collide. */
    const steps = [10, 20, 25, 50, 100, 200, 500];
    const step =
      steps.find((s) => Math.floor(hi / s) - Math.ceil(lo / s) <= 5) ??
      steps[steps.length - 1];

    const mark = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) mark.push(v);

    return { min: lo, max: hi, ticks: mark };
  }, [currentDepth, events, windowMetres]);

  const span = Math.max(max - min, 1);
  const positionOf = (depth) => {
    if (!isNum(depth)) return null;
    const raw = ((max - depth) / span) * 100;
    return Math.max(-6, Math.min(106, raw));
  };

  /* Two events only 30 m apart land within a few percent of each
     other on a 130 m axis, so the plot has to grow until the
     cards can never sit on top of one another. */
  const plotHeight = useMemo(() => {
    const points = [positionOf(anchor), ...events.map((e) => positionOf(e.historical_depth))]
      .filter((p) => p !== null)
      .sort((a, b) => a - b);

    let minGapPercent = 100;
    for (let i = 1; i < points.length; i += 1) {
      minGapPercent = Math.min(minGapPercent, points[i] - points[i - 1]);
    }

    const required = minGapPercent > 0 ? (MIN_ROW_PX / (minGapPercent / 100)) : 400;
    return Math.min(Math.max(190, Math.ceil(required / 10) * 10), 520);
  }, [anchor, events, min, max]);

  const windowTop = positionOf(anchor + windowMetres);
  const windowBottom = positionOf(anchor - windowMetres);

  if (events.length === 0) return null;

  return (
    <div
      className="depthviz"
      style={{ minHeight: plotHeight }}
    >
      <div className="depthviz__axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="depthviz__tick"
            style={{ top: `${positionOf(tick)}%` }}
          >
            {tick}
          </span>
        ))}
      </div>

      <div className="depthviz__plot">
        {anchor !== null &&
        windowTop !== null &&
        windowBottom !== null ? (
          <div
            className="depthviz__window"
            style={{
              top: `${Math.min(windowTop, windowBottom)}%`,
              height: `${Math.abs(windowBottom - windowTop)}%`
            }}
            aria-hidden="true"
          >
            <span className="depthviz__window-label">
              ±{windowMetres} m window
            </span>
          </div>
        ) : null}

        {anchor !== null ? (
          <div
            className="depthviz__node"
            style={{ top: `${positionOf(anchor)}%`, zIndex: 2 }}
          >
            <span className="depthviz__connector" style={{ opacity: 0 }} />
            <span
              className="depthviz__marker"
              data-sev="low"
              style={{ "--sev": "var(--ok)", width: 11, height: 11 }}
              aria-hidden="true"
            />
            <div
              className="depthviz__card"
              data-sev="low"
              style={{ borderLeftColor: "var(--ok)", cursor: "default" }}
            >
              <div className="depthviz__card-top">
                <span className="depthviz__card-well">ACTIVE BIT</span>
                <span className="depthviz__card-event" style={{ "--sev": "var(--ok)" }}>
                  NOW
                </span>
                <span className="depthviz__card-depth">
                  {num(anchor, 0)} m MD
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {events.map((event, index) => {
          const top = positionOf(event.historical_depth);
          if (top === null) return null;
          const severity = severityFromHistorical(event.severity);
          const offset = isNum(event.depth_difference)
            ? event.depth_difference
            : isNum(anchor) && isNum(event.historical_depth)
              ? Math.abs(anchor - event.historical_depth)
              : null;
          const similarity = similarityByWell?.[event.well_id];

          return (
            <div
              key={`${event.well_id}-${event.event}-${index}`}
              className="depthviz__node"
              style={{ top: `${top}%` }}
            >
              <span className="depthviz__connector" aria-hidden="true" />
              <span
                className="depthviz__marker"
                data-sev={severity}
                style={{ "--sev": `var(--${severity === "none" ? "info" : severity === "critical" ? "crit" : severity === "medium" ? "warn" : "ok"})` }}
                aria-hidden="true"
              />
              <button
                type="button"
                className="depthviz__card"
                data-sev={severity}
                onClick={() => onSelectWell?.(event.well_id)}
                title={`Open intelligence for ${event.well_id}`}
              >
                <div className="depthviz__card-top">
                  <span className="depthviz__card-well">{event.well_id}</span>
                  <span
                    className="depthviz__card-event"
                    style={{
                      "--sev": `var(--${severity === "critical" ? "crit" : severity === "medium" ? "warn" : severity === "low" ? "ok" : "info"})`
                    }}
                  >
                    {fmtLabel(event.event).toUpperCase()}
                  </span>
                  {event.severity ? (
                    <span
                      className="badge"
                      data-sev={severity}
                      style={{ height: 15, fontSize: 9 }}
                    >
                      {fmtLabel(event.severity)}
                    </span>
                  ) : null}
                  <span className="depthviz__card-depth">
                    {num(event.historical_depth, 0)} m MD
                  </span>
                </div>
                <div className="depthviz__card-foot">
                  {isNum(offset) ? (
                    <span className="depthviz__delta">
                      <IconArrowDown size={11} />
                      <b>{num(offset, 1)} m</b> from current depth
                    </span>
                  ) : null}
                  {isNum(similarity) ? (
                    <span className="depthviz__delta">
                      similarity <b>{num(similarity, 1)}%</b>
                    </span>
                  ) : (
                    <span className="depthviz__delta dim">similarity not ranked</span>
                  )}
                  {event.mitigation ? (
                    <span className="truncate" style={{ maxWidth: "100%" }}>
                      Mitigation: {event.mitigation}
                    </span>
                  ) : null}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      <span className="sr-only">
        <IconDepth size={12} />
        <IconRuler size={12} />
        Depth axis from {min} to {max} metres. Active bit at{" "}
        {num(anchor, 0)} metres.
      </span>
    </div>
  );
}

export const DepthLadder = memo(DepthLadderBase);
export default DepthLadder;
