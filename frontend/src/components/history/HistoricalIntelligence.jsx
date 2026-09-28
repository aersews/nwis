import { memo, useMemo } from "react";

import { DepthLadder } from "./DepthLadder.jsx";
import { EmptyState } from "../common/States.jsx";
import { SkeletonRows } from "../common/States.jsx";
import { isNum, km, label as fmtLabel, num } from "../../lib/format.js";
import { severityFromHistorical } from "../../lib/risk.js";
import { IconHistory, IconRuler, IconDepth } from "../common/Icons.jsx";

const WINDOW_METRES = 50;

function HistoricalIntelligenceBase({
  contextual,
  wellRecord,
  loading,
  windowMetres = WINDOW_METRES,
  onSelectWell
}) {
  const events = useMemo(
    () => contextual?.historical_events ?? [],
    [contextual]
  );

  const similarityByWell = useMemo(() => {
    const map = {};
    for (const offset of contextual?.offsets ?? []) {
      if (offset?.well_id && isNum(offset.similarity_score)) {
        map[offset.well_id] = offset.similarity_score;
      }
    }
    return map;
  }, [contextual]);

  const distanceByWell = useMemo(() => {
    const map = {};
    for (const offset of contextual?.offsets ?? []) {
      if (offset?.well_id) map[offset.well_id] = offset.distance_km;
    }
    return map;
  }, [contextual]);

  const currentDepth = contextual?.well?.depth ?? null;
  const formation = contextual?.well?.formation ?? null;
  const totalDepth = wellRecord?.total_depth ?? null;

  const byEventType = useMemo(() => {
    const counts = {};
    for (const event of events) {
      const key = fmtLabel(event.event, "Unknown");
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [events]);

  const depthRatio =
    isNum(currentDepth) && isNum(totalDepth) && totalDepth > 0
      ? Math.min(100, (currentDepth / totalDepth) * 100)
      : null;

  if (loading && !contextual) {
    return <SkeletonRows rows={4} columns={[0.6, 0.4, 0.3]} />;
  }

  return (
    <>
      <div className="kv">
        <div className="kv__cell">
          <span className="kv__label">
            <IconDepth size={10} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
            Current depth
          </span>
          <span className="kv__value">
            {isNum(currentDepth) ? num(currentDepth, 0) : "—"}
            <small> m MD</small>
          </span>
        </div>
        <div className="kv__cell">
          <span className="kv__label">Formation</span>
          <span className="kv__value">{fmtLabel(formation)}</span>
        </div>
        <div className="kv__cell">
          <span className="kv__label">
            <IconRuler size={10} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
            Window
          </span>
          <span className="kv__value">
            ±{windowMetres}
            <small> m</small>
          </span>
        </div>
        <div className="kv__cell">
          <span className="kv__label">Matches</span>
          <span className="kv__value kv__value--sev">
            {contextual?.historical_event_count ?? events.length}
            <small> events</small>
          </span>
        </div>
      </div>

      {isNum(depthRatio) ? (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "var(--s-3)"
            }}
          >
            <span className="label">Hole progress</span>
            <span className="label" style={{ color: "var(--text-faint)" }}>
              {num(currentDepth, 0)} / {num(totalDepth, 0)} m TD
            </span>
          </div>
          <div
            className="deptrack"
            role="progressbar"
            aria-valuenow={Math.round(depthRatio)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress toward total depth"
          >
            <div className="deptrack__fill" style={{ width: `${depthRatio}%` }} />
            <div
              className="deptrack__marker"
              style={{ left: `${depthRatio}%` }}
            />
          </div>
        </div>
      ) : null}

      {events.length === 0 ? (
        <EmptyState
          compact
          severity="low"
          icon={<IconHistory size={16} />}
          title="No historical events in this window"
          message={`No recorded event for ${fmtLabel(formation)} lies within ±${windowMetres} m of ${num(currentDepth, 0)} m. Widening the window is not applied automatically — the backend fixes the comparison band.`}
        />
      ) : (
        <DepthLadder
          currentDepth={currentDepth}
          windowMetres={windowMetres}
          events={events}
          similarityByWell={similarityByWell}
          onSelectWell={onSelectWell}
        />
      )}

      {byEventType.length > 0 || events.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--s-4)",
            alignItems: "center"
          }}
        >
          {byEventType.map(([type, count]) => {
            const sample = events.find((e) => fmtLabel(e.event, "Unknown") === type);
            return (
              <span
                key={type}
                className="badge badge--lg"
                data-sev={severityFromHistorical(sample?.severity)}
                title={`${count} matching event(s) of this type in the window`}
              >
                {type} × {count}
              </span>
            );
          })}

          {events.length > 0 ? (
            <span
              style={{
                fontSize: "var(--fs-xs)",
                color: "var(--text-faint)",
                lineHeight: 1.55
              }}
            >
              Correlated wells:{" "}
              {Array.from(new Set(events.map((e) => e.well_id)))
                .map((id) => {
                  const distance = distanceByWell[id];
                  return `${id}${isNum(distance) ? ` (${km(distance)})` : ""}`;
                })
                .join(", ")}
              . Similarity and distance come from the offset ranking in
              the same response.
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export const HistoricalIntelligence = memo(HistoricalIntelligenceBase);
export default HistoricalIntelligence;
