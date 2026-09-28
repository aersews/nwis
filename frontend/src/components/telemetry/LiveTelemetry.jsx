import { memo, useMemo } from "react";

import { StreamChart } from "../common/StreamChart.jsx";
import {
  IconActivity,
  IconArrowDown,
  IconArrowUp,
  IconMinus,
  IconRadio,
  IconRefresh
} from "../common/Icons.jsx";
import { SIGNALS, bandForScore, signalAdverse } from "../../lib/risk.js";
import { isNum, num, relativeTime } from "../../lib/format.js";

const SOURCES = [
  {
    id: "scenario",
    label: "Simulated stream",
    short: "SIMULATED",
    note: "Scripted demonstration sequence from /api/simulation"
  },
  {
    id: "replay",
    label: "Historical replay",
    short: "REPLAY",
    note: "WebSocket replay of the indexed drilling record"
  }
];

function TrendGlyph({ dir }) {
  if (dir === "up") return <IconArrowUp size={12} />;
  if (dir === "down") return <IconArrowDown size={12} />;
  return <IconMinus size={12} />;
}

function SignalChart({ signal, series, xLabels, adverse }) {
  const points = useMemo(
    () => series.map((s) => s[signal.key]).filter(isNum),
    [series, signal.key]
  );

  const latest = points[points.length - 1];
  const baseline = points[0];
  const delta =
    isNum(latest) && isNum(baseline) && baseline !== 0
      ? ((latest - baseline) / Math.abs(baseline)) * 100
      : null;

  const dir = !isNum(delta) || Math.abs(delta) < 0.5
    ? "flat"
    : delta > 0
      ? "up"
      : "down";

  const isAdverse =
    adverse ?? (isNum(latest) ? signalAdverse(signal, latest) : false);

  const color = isAdverse ? "var(--warn)" : signal.key === "ecd" ? "var(--info)" : "var(--info)";

  const [min, max] = signal.domain;

  return (
    <article
      className="stream"
      data-sev={isAdverse ? "medium" : "none"}
      style={{ "--stream-color": color }}
    >
      <header className="stream__head">
        <div>
          <h4 className="stream__name" title={signal.longName}>
            {signal.name}
          </h4>
          <p className="stream__reading">
            <span className="stream__value">
              {isNum(latest) ? num(latest, signal.digits) : "—"}
            </span>
            <span className="stream__unit">{signal.unit}</span>
          </p>
        </div>
        <div className="stream__trend">
          <span
            className="stream__delta"
            data-dir={dir}
            style={{ "--trend-color": isAdverse ? "var(--warn)" : "var(--text-low)" }}
            title={
              isNum(delta)
                ? `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}% against the first sample in this window`
                : "Not enough samples"
            }
          >
            <TrendGlyph dir={dir} />
            {isNum(delta) ? `${Math.abs(delta).toFixed(0)}%` : "—"}
          </span>
        </div>
      </header>

      <StreamChart
        points={points}
        domain={[min, max]}
        unit={signal.unit}
        digits={signal.digits}
        xLabels={xLabels}
        id={`sig-${signal.key}`}
      />

      <footer className="stream__axis" aria-hidden="true">
        <span>{points.length ? xLabels[0] ?? "" : "awaiting"}</span>
        <span>
          {points.length ? `min ${num(Math.min(...points), signal.digits)}` : ""}
        </span>
        <span>
          {points.length ? `max ${num(Math.max(...points), signal.digits)}` : ""}
        </span>
        <span>{points.length ? (xLabels[xLabels.length - 1] ?? "") : ""}</span>
      </footer>
    </article>
  );
}

function LiveTelemetryBase({
  scenarioFrame,
  scenarioHistory,
  streamStatus,
  streamPoints,
  streamLastMessageAt,
  source,
  onSourceChange
}) {
  const usingScenario = source === "scenario";

  const series = useMemo(() => {
    if (usingScenario) {
      return scenarioHistory.map((frame) => ({
        ...(frame?.signals ?? {}),
        depth: frame?.depth ?? null
      }));
    }
    return streamPoints.map((p) => ({
      rop: p.rop,
      torque: p.torque,
      ecd: p.ecd,
      pit_volume: p.pit_volume,
      depth: p.depth
    }));
  }, [usingScenario, scenarioHistory, streamPoints]);

  const xLabels = useMemo(() => {
    if (usingScenario) {
      return scenarioHistory.map((frame) =>
        frame?.depth !== undefined && frame?.depth !== null
          ? `${Math.round(frame.depth)} m`
          : ""
      );
    }
    return streamPoints.map((p) =>
      p?.t ? String(p.t).slice(11, 16) : ""
    );
  }, [usingScenario, scenarioHistory, streamPoints]);

  const liveFrame = usingScenario ? scenarioFrame : null;
  const liveRisk = liveFrame?.risk ?? null;

  const warningList = liveFrame?.warnings ?? [];
  const adverseKeys = new Set(
    SIGNALS.filter((s) => signalAdverse(s, series[series.length - 1]?.[s.key]))
      .map((s) => s.key)
  );

  const lastAt = usingScenario ? null : streamLastMessageAt;
  const riskHistory = series.map((s) => s.rop);
  const peakRisk = riskHistory.length ? Math.max(...riskHistory) : 0;

  const statusText = usingScenario
    ? scenarioFrame
      ? "SIMULATED STREAM"
      : "STREAM IDLE"
    : streamStatus === "open"
      ? "WEBSOCKET LIVE"
      : streamStatus === "reconnecting"
        ? "RECONNECTING"
        : streamStatus === "connecting"
          ? "CONNECTING"
          : "STREAM IDLE";

  const statusSeverity =
    warningList.length > 0
      ? "medium"
      : usingScenario
        ? "info"
        : streamStatus === "open"
          ? "low"
          : "none";

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--s-5)",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-5)",
            flexWrap: "wrap"
          }}
        >
          <span
            className="badge badge--pulse"
            data-sev={statusSeverity}
            role="status"
            aria-live="polite"
          >
            <i className="badge__dot" aria-hidden="true" />
            {statusText}
          </span>
          <span
            className="label"
            style={{ color: "var(--text-faint)", letterSpacing: "0.1em" }}
          >
            <IconRadio
              size={11}
              style={{ display: "inline", verticalAlign: "-1px" }}
            />{" "}
            {series.length} samples
            {lastAt ? ` · updated ${relativeTime(lastAt)}` : ""}
          </span>
          {usingScenario ? (
            <span className="badge badge--plain" title="Not real operational data">
              DEMO DATA
            </span>
          ) : null}
        </div>

        <div className="btn-group" role="group" aria-label="Telemetry source">
          {SOURCES.map((option) => (
            <button
              key={option.id}
              type="button"
              className="btn"
              aria-pressed={source === option.id}
              onClick={() => onSourceChange?.(option.id)}
              title={option.note}
            >
              {option.short}
            </button>
          ))}
        </div>
      </div>

      {warningList.length > 0 ? (
        <div
          className="banner banner--warn"
          style={{ padding: "var(--s-4) var(--s-5)" }}
        >
          <IconActivity size={14} className="banner__icon" />
          <div className="banner__body">
            <span className="banner__text">
              Backend precursor flags: {warningList.join(" · ")}
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid grid--telemetry">
        {SIGNALS.map((signal) => (
          <SignalChart
            key={signal.key}
            signal={signal}
            series={series}
            xLabels={xLabels}
            adverse={adverseKeys.has(signal.key)}
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: "var(--s-6)",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <span className="note">
          <IconRefresh size={13} className="note__icon" />
          <span>
            {usingScenario
              ? "Scripted demonstration sequence served by /api/simulation — a synthetic worsening trend, not a live well."
              : "WebSocket replay of the indexed drilling record for this well, scored by the same risk engine."}{" "}
            Deltas compare the latest sample with the first sample in the
            visible window.
          </span>
        </span>
        {liveRisk ? (
          <span
            className="label"
            data-sev={bandForScore(liveRisk.score).key}
            style={{ color: "var(--sev)", whiteSpace: "nowrap" }}
          >
            Stream index {num(liveRisk.score, 0)} · {liveRisk.level}
            {peakRisk > 0 ? "" : ""}
          </span>
        ) : null}
      </div>
    </>
  );
}

export const LiveTelemetry = memo(LiveTelemetryBase);
export default LiveTelemetry;
