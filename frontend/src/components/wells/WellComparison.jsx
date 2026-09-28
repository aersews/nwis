import { useMemo } from "react";

import { Modal } from "../common/Modal.jsx";
import { Badge } from "../common/Badge.jsx";
import { NOT_AVAILABLE, isNum, label as fmtLabel, num, percent } from "../../lib/format.js";
import { severityFromHistorical, similarityTier } from "../../lib/risk.js";
import { IconInfo, IconCompare } from "../common/Icons.jsx";

const ACTIVE_COLOR = "var(--ok)";
const OFFSET_COLOR = "var(--info)";

function Cell({
  label,
  active,
  offset,
  differ,
  bar
}) {
  const render = (value, color) => (
    <>
      <span>{value}</span>
      {bar && isNum(bar.value) ? (
        <span className="compare__bar" style={{ "--cell-color": color }}>
          <span style={{ width: `${Math.min(100, bar.percent)}%` }} />
        </span>
      ) : null}
    </>
  );

  return (
    <>
      <div className="compare__cell compare__cell--key">{label}</div>
      <div
        className={`compare__cell compare__cell--val${
          differ ? " compare__cell--diff" : ""
        }`}
        style={{ "--cell-color": ACTIVE_COLOR }}
      >
        {render(active)}
        {differ ? <span className="compare__diff-flag">differs</span> : null}
      </div>
      <div
        className={`compare__cell compare__cell--val${
          differ ? " compare__cell--diff" : ""
        }`}
        style={{ "--cell-color": OFFSET_COLOR }}
      >
        {render(offset)}
      </div>
    </>
  );
}

function same(a, b) {
  if (a === b) return true;
  if (!isNum(a) || !isNum(b)) return (a ?? null) === (b ?? null);
  return Math.abs(a - b) < 0.05;
}

/**
 * Attribute-by-attribute comparison. Differences are marked on
 * both sides rather than colour-coded only.
 */
export function WellComparison({
  open,
  onClose,
  activeWell,
  activeRecord,
  activeDepth,
  activeSignals,
  activeRiskLevel,
  offset,
  offsetRecord,
  offsetEvents = [],
  activeEventCount = 0,
  onViewSource
}) {
  const {
    formation: offsetFormationRecord,
    trajectory: offsetTrajectory,
    hole_section: offsetHole,
    total_depth: offsetTotalDepth
  } = offsetRecord ?? {};

  const rows = useMemo(
    () => [
      {
        key: "formation",
        label: "Formation",
        active: fmtLabel(activeRecord?.formation),
        offset: fmtLabel(offsetFormationRecord ?? offset?.formation)
      },
      {
        key: "trajectory",
        label: "Trajectory",
        active: fmtLabel(activeRecord?.trajectory),
        offset: fmtLabel(offsetTrajectory ?? offset?.trajectory)
      },
      {
        key: "hole",
        label: "Hole section",
        active: fmtLabel(activeRecord?.hole_section),
        offset: fmtLabel(offsetHole ?? offset?.hole_section)
      },
      {
        key: "distance",
        label: "Separation",
        active: "0.00 km (self)",
        offset: isNum(offset?.distance_km) ? `${num(offset.distance_km, 2)} km` : NOT_AVAILABLE
      },
      {
        key: "similarity",
        label: "Similarity",
        active: "100% (self)",
        offset: percent(offset?.similarity_score, 1),
        bar: {
          value: offset?.similarity_score,
          percent: offset?.similarity_score ?? 0
        }
      },
      {
        key: "td",
        label: "Total depth",
        active: isNum(activeRecord?.total_depth)
          ? `${num(activeRecord.total_depth, 0)} m`
          : NOT_AVAILABLE,
        offset: isNum(offsetTotalDepth) ? `${num(offsetTotalDepth, 0)} m` : NOT_AVAILABLE,
        bar: {
          value: offsetTotalDepth,
          percent:
            isNum(offsetTotalDepth) && isNum(activeRecord?.total_depth) && activeRecord.total_depth > 0
              ? (offsetTotalDepth / activeRecord.total_depth) * 100
              : 0
        }
      },
      {
        key: "current",
        label: "Depth of interest",
        active: isNum(activeDepth) ? `${num(activeDepth, 0)} m (live bit)` : NOT_AVAILABLE,
        offset: nearestEventDepth(offsetEvents, activeDepth)
      },
      {
        key: "events",
        label: "Events in formation",
        active: `${activeEventCount}`,
        offset: `${offset?.historical_event_count ?? 0}`
      },
      {
        key: "incidents",
        label: "Incident types",
        active: "Live precursors only",
        offset:
          offsetEvents.length > 0
            ? offsetEvents
                .map((e) => `${fmtLabel(e.event)} ${num(e.depth, 0)} m`)
                .join(" · ")
            : "None recorded"
      },
      {
        key: "mud",
        label: "Mud programme",
        active: NOT_AVAILABLE,
        offset: NOT_AVAILABLE
      },
      {
        key: "casing",
        label: "Casing points",
        active: NOT_AVAILABLE,
        offset: NOT_AVAILABLE
      },
      {
        key: "rop",
        label: "ROP (live)",
        active: isNum(activeSignals?.rop) ? `${num(activeSignals.rop, 1)} m/hr` : NOT_AVAILABLE,
        offset: "Not recorded"
      },
      {
        key: "torque",
        label: "Torque (live)",
        active: isNum(activeSignals?.torque) ? `${num(activeSignals.torque, 1)} kN·m` : NOT_AVAILABLE,
        offset: "Not recorded"
      },
      {
        key: "ecd",
        label: "ECD (live)",
        active: isNum(activeSignals?.ecd) ? `${num(activeSignals.ecd, 3)} sg` : NOT_AVAILABLE,
        offset: "Not recorded"
      },
      {
        key: "risk",
        label: "Risk state",
        active: fmtLabel(activeRiskLevel, "—"),
        offset: "Historical record only"
      }
    ],
    [
      offset,
      offsetFormationRecord,
      offsetTrajectory,
      offsetHole,
      offsetTotalDepth,
      offsetEvents,
      activeRecord,
      activeDepth,
      activeSignals,
      activeRiskLevel,
      activeEventCount
    ]
  );

  const tier = similarityTier(offset?.similarity_score);

  if (!offset) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      severity={tier.key === "strong" ? "medium" : "info"}
      eyebrow="Compare mode"
      title={`${fmtLabel(activeWell)} vs ${fmtLabel(offset.well_id)}`}
      tools={
        <Badge severity="info" dot={false}>
          {percent(offset.similarity_score, 1)} similar
        </Badge>
      }
      actions={
        <>
          <span className="label" style={{ letterSpacing: "0.1em" }}>
            <IconCompare size={10} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
            Attributes not present in the dataset are marked “Not available”
            — they are never inferred
          </span>
        </>
      }
    >
      <div className="compare">
        <div className="compare__cell compare__cell--key">Attribute</div>
        <div
          className="compare__cell compare__cell--head"
          style={{ "--cell-color": ACTIVE_COLOR }}
          data-attr="Active"
        >
          <span className="compare__role">Active well</span>
          <span className="compare__well">{fmtLabel(activeWell)}</span>
        </div>
        <div
          className="compare__cell compare__cell--head"
          style={{ "--cell-color": OFFSET_COLOR }}
          data-attr="Offset"
        >
          <span className="compare__role">Offset well</span>
          <span className="compare__well">{fmtLabel(offset.well_id)}</span>
        </div>

        {rows.map((row) => (
          <Cell
            key={row.key}
            label={row.label}
            active={row.active}
            offset={row.offset}
            bar={row.bar}
            differ={!same(row.active, row.offset) && row.key !== "distance" && row.key !== "similarity"}
          />
        ))}
      </div>

      {offsetEvents.length > 0 ? (
        <div className="drawer__section">
          <div className="drawer__section-head">
            <span className="label">Offset event timeline</span>
          </div>
          <div className="deflist">
            {offsetEvents.map((event, index) => (
              <div
                className="deflist__row"
                key={`${event.depth}-${event.event}-${index}`}
              >
                <span className="deflist__key">
                  <span
                    className="badge"
                    data-sev={severityFromHistorical(event.severity)}
                    style={{ height: 15, marginRight: 8 }}
                  >
                    {fmtLabel(event.severity)}
                  </span>
                  {fmtLabel(event.event)}
                </span>
                <span className="deflist__val">
                  {num(event.depth, 0)} m
                  {event.mitigation ? ` · ${fmtLabel(event.mitigation)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {onViewSource ? (
        <div style={{ display: "flex", gap: "var(--s-4)", flexWrap: "wrap" }}>
          {offsetEvents
            .filter((event) => event.source)
            .slice(0, 3)
            .map((event, index) => (
              <button
                key={`${event.source}-${index}`}
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => onViewSource(event.source)}
              >
                {fmtLabel(event.source)}
              </button>
            ))}
        </div>
      ) : null}

      <p className="note">
        <IconInfo size={13} className="note__icon" />
        <span>
          Live signal values belong to the active well only — the
          demonstration dataset does not carry historical time-series for
          offset wells, so those cells are intentionally left unfilled
          rather than approximated.
        </span>
      </p>
    </Modal>
  );
}

function nearestEventDepth(events, currentDepth) {
  if (!isNum(currentDepth) || events.length === 0) return NOT_AVAILABLE;
  let best = null;
  for (const event of events) {
    if (!isNum(event.depth)) continue;
    const delta = Math.abs(event.depth - currentDepth);
    if (best === null || delta < best.delta) {
      best = { event, delta };
    }
  }
  return best
    ? `${num(best.event.depth, 0)} m (−${num(best.delta, 0)} m)`
    : NOT_AVAILABLE;
}

export default WellComparison;
