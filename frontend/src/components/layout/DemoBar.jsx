import { memo } from "react";

import {
  IconInfo,
  IconPause,
  IconPlay,
  IconRefresh,
  IconRestart,
  IconStep
} from "../common/Icons.jsx";
import { SPEEDS } from "../../hooks/useDemoSimulation.js";
import { num } from "../../lib/format.js";

const SEGMENTS = 11;

/**
 * Demo transport. The scenario is a scripted demonstration, and
 * the control surface says so on every screen.
 */
function DemoBarBase({
  demo,
  intelligenceStatus,
  onOpenProvenance
}) {
  const { running, step, maxStep, phase, speed, frame } = demo;

  return (
    <div className="demobar" role="region" aria-label="Demonstration controls">
      <span className="demobar__mode">
        <i className="demobar__mode-led" aria-hidden="true" />
        Demo mode
      </span>

      <div className="demobar__phase">
        <span className="demobar__phase-name">{phase.name}</span>
        <span className="demobar__phase-desc">
          {demo.error ?? phase.description}
        </span>
      </div>

      <div className="demobar__progress">
        <div
          className="demobar__track"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={0}
          aria-valuemax={maxStep}
          aria-label="Demonstration sequence progress"
        >
          {Array.from({ length: SEGMENTS }).map((_, index) => {
            const reached = index < step + 1 && step > 0;
            const current = index === step;
            const crit = reached && (frame?.risk?.level ?? "").toLowerCase() === "critical";
            return (
              <span
                key={index}
                className={[
                  "demobar__seg",
                  reached ? (crit ? "is-crit" : "is-done") : "",
                  current ? "is-current" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            );
          })}
        </div>
        <span className="demobar__step">
          step {step}/{maxStep}
        </span>
      </div>

      <div className="demobar__controls">
        <button
          type="button"
          className={`btn btn--icon${running ? "" : " btn--primary"}`}
          onClick={running ? demo.pause : demo.start}
          disabled={!running && demo.atEnd}
          title={running ? "Pause the sequence" : "Start the sequence"}
          aria-label={running ? "Pause sequence" : "Start sequence"}
        >
          {running ? <IconPause size={12} /> : <IconPlay size={12} />}
        </button>
        <button
          type="button"
          className="btn btn--icon"
          onClick={demo.stepForward}
          disabled={running || demo.atEnd}
          title="Advance one step"
          aria-label="Advance one step"
        >
          <IconStep size={12} />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          onClick={demo.restart}
          title="Restart from step 0"
          aria-label="Restart sequence"
        >
          <IconRestart size={12} />
        </button>

        <div className="btn-group" role="group" aria-label="Simulation speed">
          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              className="btn"
              aria-pressed={speed === option}
              onClick={() => demo.setSpeed(option)}
              title={`${option}× sampling interval`}
            >
              {option}×
            </button>
          ))}
        </div>

        {demo.error ? (
          <button
            type="button"
            className="btn btn--icon"
            onClick={demo.retry}
            title="Clear the stream error and resume from this step"
            aria-label="Clear stream error"
          >
            <IconRefresh size={12} />
          </button>
        ) : null}
      </div>

      <div className="demobar__meta">
        <div className="demobar__meta-item">
          <span className="readout__label">Live depth</span>
          <span className="demobar__meta-value">
            {frame?.depth !== undefined ? `${num(frame.depth, 0)} m` : "—"}
          </span>
        </div>
        <div className="demobar__meta-item">
          <span className="readout__label">Stream index</span>
          <span
            className="demobar__meta-value"
            data-sev={(frame?.risk?.level ?? "low").toLowerCase()}
            style={{ color: "var(--sev, var(--text-hi))" }}
          >
            {frame?.risk?.score !== undefined ? num(frame.risk.score, 0) : "—"}
          </span>
        </div>
        <div className="demobar__meta-item">
          <span className="readout__label">Intelligence</span>
          <span
            className="demobar__meta-value"
            style={{
              color:
                intelligenceStatus === "ready"
                  ? "var(--ok)"
                  : intelligenceStatus === "error"
                    ? "var(--crit)"
                    : "var(--text-mid)"
            }}
          >
            {intelligenceStatus === "ready"
              ? "In sync"
              : intelligenceStatus === "error"
                ? "Failed"
                : intelligenceStatus === "refreshing"
                  ? "Syncing"
                  : "Pending"}
          </span>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onOpenProvenance}
          title="Where every number on this screen comes from"
        >
          <IconInfo size={12} />
          Provenance
        </button>
      </div>
    </div>
  );
}

export const DemoBar = memo(DemoBarBase);
export default DemoBar;
