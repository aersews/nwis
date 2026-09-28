import { memo, useId, useMemo, useState } from "react";

import { useElementSize } from "../../hooks/index.js";
import { isNum } from "../../lib/format.js";

const PADDING = { top: 6, right: 2, bottom: 6, left: 2 };

function buildPath(values, width, height, domain) {
  const innerW = Math.max(width - PADDING.left - PADDING.right, 1);
  const innerH = Math.max(height - PADDING.top - PADDING.bottom, 1);
  const [dMin, dMax] = domain;
  const span = dMax - dMin || 1;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;

  const coords = values.map((value, index) => {
    const x = PADDING.left + index * step;
    const ratio = (value - dMin) / span;
    const y = PADDING.top + innerH - ratio * innerH;
    return [x, y];
  });

  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  const baseline = PADDING.top + innerH;
  const area = coords.length
    ? `${line} L${coords[coords.length - 1][0].toFixed(2)} ${baseline} L${coords[0][0].toFixed(2)} ${baseline} Z`
    : "";

  return { line, area, coords, baseline };
}

/**
 * Real-time parameter trace. Deliberately not a generic
 * charting widget: one series, one unit, no legend clutter —
 * the operator only needs the shape, the latest value and the
 * magnitude of change.
 */
function StreamChartBase({
  points = [],
  color = "var(--info)",
  domain = [0, 1],
  height = 74,
  unit = "",
  digits = 1,
  id: providedId
}) {
  const reactId = useId();
  const chartId = providedId ?? reactId;
  const [wrapRef, size] = useElementSize();
  const [cursor, setCursor] = useState(null);

  const width = size.width || 240;

  const geometry = useMemo(
    () => buildPath(points, width, height, domain),
    [points, width, height, domain]
  );

  const hasData = points.length > 1;
  const first = points[0];
  const last = points[points.length - 1];
  const lastCoord = geometry.coords[geometry.coords.length - 1];

  const onMove = (event) => {
    if (!hasData) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const innerW = Math.max(width - PADDING.left - PADDING.right, 1);
    const step = innerW / (points.length - 1);
    const index = Math.round((x - PADDING.left) / step);
    setCursor(Math.max(0, Math.min(points.length - 1, index)));
  };

  const cursorCoord = cursor !== null ? geometry.coords[cursor] : null;
  const cursorValue = cursor !== null ? points[cursor] : null;

  return (
    <div className="stream__plot" ref={wrapRef}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Trend trace, ${points.length} samples, latest ${
          isNum(last) ? last.toFixed(digits) : "—"
        } ${unit}`}
        onPointerMove={onMove}
        onPointerLeave={() => setCursor(null)}
      >
        <defs>
          <linearGradient id={`fade-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        <line
          className="stream__grid-line"
          x1={0}
          x2={width}
          y1={geometry.baseline}
          y2={geometry.baseline}
        />
        <line
          className="stream__grid-line"
          x1={0}
          x2={width}
          y1={PADDING.top}
          y2={PADDING.top}
          opacity="0.6"
        />

      {hasData ? (
        <>
          <path className="stream__area" d={geometry.area} fill={`url(#fade-${chartId})`} />
          <path
            className="stream__line"
            d={geometry.line}
            style={{ "--stream-color": color }}
          />
          {lastCoord ? (
            <>
              <circle
                className="stream__head-ring"
                cx={lastCoord[0]}
                cy={lastCoord[1]}
                r="5"
              />
              <circle
                className="stream__head-dot"
                cx={lastCoord[0]}
                cy={lastCoord[1]}
                r="2.4"
                style={{ "--stream-color": color }}
              />
            </>
          ) : null}
        </>
      ) : (
        <g aria-hidden="true">
          <line
            x1={0}
            x2={width}
            y1={geometry.baseline}
            y2={geometry.baseline}
            stroke="var(--line-strong)"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        </g>
      )}

        {cursorCoord ? (
          <>
            <line
              className="stream__crosshair"
              x1={cursorCoord[0]}
              x2={cursorCoord[0]}
              y1={PADDING.top}
              y2={geometry.baseline}
            />
            <circle
              className="stream__cursor-dot"
              cx={cursorCoord[0]}
              cy={cursorCoord[1]}
              r="3"
              style={{ "--stream-color": color }}
            />
          </>
        ) : null}
      </svg>

      {cursorCoord && isNum(cursorValue) ? (
        <span
          className="stream__readout"
          style={{
            left: `${cursorCoord[0]}px`,
            top: `${Math.max(cursorCoord[1] - 8, 14)}px`,
            "--stream-color": color
          }}
        >
          <b>{cursorValue.toFixed(digits)}</b> {unit}
        </span>
      ) : null}

      {!hasData ? (
        <span className="stream__empty" aria-hidden="true">
          Start the sequence
        </span>
      ) : null}

      <span className="sr-only">
        {hasData
          ? `Series from ${first.toFixed(digits)} ${unit} to ${last.toFixed(digits)} ${unit} across ${points.length} samples.`
          : "Awaiting telemetry samples."}
      </span>
    </div>
  );
}

export const StreamChart = memo(StreamChartBase);
export default StreamChart;
