import { memo } from "react";

import { isNum, label as fmtLabel, num } from "../../lib/format.js";
import { bandForLevel, bandForScore } from "../../lib/risk.js";
import { IconSearch } from "../common/Icons.jsx";

/**
 * The persistent command bar. Whatever the operator is reading,
 * the well, the bit depth and the current risk stay on screen.
 */
function TopBarBase({
  wellId,
  formation,
  depth,
  mode,
  riskLevel,
  riskScore,
  systemState,
  clock,
  onOpenSearch
}) {
  const band = bandForLevel(riskLevel) ?? bandForScore(riskScore);
  const state = systemState?.reachable ? "online" : "offline";
  const stateLabel = systemState?.reachable
    ? `System ${fmtLabel(systemState.status, "online")}`
    : "System unreachable";

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true" />
        <span className="topbar__id">
          <h1 className="topbar__name">NWIS</h1>
          <span className="topbar__tag">
            Nearby Wells Intelligence
          </span>
        </span>
      </div>

      <div className="topbar__readouts">
        <div className="readout readout--well">
          <span className="readout__label">Active well</span>
          <span className="readout__value">{fmtLabel(wellId)}</span>
        </div>
        <div className="readout readout--formation">
          <span className="readout__label">Formation</span>
          <span className="readout__value">{fmtLabel(formation)}</span>
        </div>
        <div
          className={`readout readout--depth${isNum(depth) ? " is-advancing" : ""}`}
        >
          <span className="readout__label">
            <span className="label-long">Current depth</span>
            <span className="label-short">Depth</span>
          </span>
          <span className="readout__value">
            {isNum(depth) ? num(depth, 0) : "—"}
            <small>m</small>
          </span>
        </div>
        <div className="readout readout--mode">
          <span className="readout__label">Mode</span>
          <span className="readout__value" style={{ fontSize: 13 }}>
            DEMO
            <small>{mode ? ` / ${mode}` : ""}</small>
          </span>
        </div>
      </div>

      <div className="topbar__risk" data-sev={band.key} role="status" aria-live="polite">
        <span className="topbar__risk-level">{fmtLabel(riskLevel, "—")}</span>
        <span className="topbar__risk-score">
          {isNum(riskScore) ? num(riskScore, 0) : "—"}
          <span>/100</span>
        </span>
        <span
          className="topbar__risk-gauge"
          role="img"
          aria-label={`Risk index ${isNum(riskScore) ? Math.round(riskScore) : "unknown"} of 100`}
        >
          <span
            className="topbar__risk-fill"
            style={{ width: `${isNum(riskScore) ? riskScore : 0}%` }}
          />
        </span>
      </div>

      <div className="topbar__right">
        <span className="status-dot" data-state={state} title={systemState?.note ?? ""}>
          <i className="status-dot__led" aria-hidden="true" />
          <span className="sr-only">{stateLabel}</span>
          <span aria-hidden="true">
            {systemState?.reachable ? "Online" : "Offline"}
          </span>
        </span>

        <span className="clock" title="Local time — the backend does not stamp demo frames">
          {clock}
          <small>Last update</small>
        </span>

        <button
          type="button"
          className="searchbtn"
          onClick={onOpenSearch}
          aria-label="Open global intelligence search"
        >
          <IconSearch size={13} />
          <span className="searchbtn__text">Search wells, events, documents…</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>
    </header>
  );
}

export const TopBar = memo(TopBarBase);
export default TopBar;
