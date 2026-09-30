import { memo, useMemo, useState } from "react";

import { EmptyState } from "../common/States.jsx";
import { similarityTier } from "../../lib/risk.js";
import { isNum, km, label as fmtLabel, percent } from "../../lib/format.js";
import {
  IconChevronRight,
  IconFilter,
  IconRoute,
  IconSearch,
  IconSort
} from "../common/Icons.jsx";

const SORTS = [
  { id: "similarity", label: "Similarity (high → low)" },
  { id: "distance", label: "Distance (near → far)" },
  { id: "events", label: "Historical events (most → fewest)" },
  { id: "well", label: "Well ID (A → Z)" }
];

const EVENT_TYPES = [
  "Stuck Pipe",
  "Lost Circulation",
  "Kick"
];

/**
 * Offset-well explorer. Every control narrows the *real* ranking
 * returned by /api/wells/{id}/offsets; nothing is re-scored here.
 */
function OffsetExplorerBase({
  offsets,
  activeFormation,
  onSelectWell,
  onOpenWell,
  selectedWellId,
  diagnostics
}) {
  const [query, setQuery] = useState("");
  const [maxDistance, setMaxDistance] = useState(50);
  const [minSimilarity, setMinSimilarity] = useState(0);
  const [formation, setFormation] = useState("ALL");
  const [eventType, setEventType] = useState("ALL");
  const [sort, setSort] = useState("similarity");

  const formations = useMemo(() => {
    const set = new Set(offsets.map((o) => o.formation).filter(Boolean));
    return Array.from(set).sort();
  }, [offsets]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    const rows = offsets.filter((offset) => {
      if (isNum(offset.distance_km) && offset.distance_km > maxDistance) {
        return false;
      }
      if (isNum(offset.similarity_score) && offset.similarity_score < minSimilarity) {
        return false;
      }
      if (formation !== "ALL" && offset.formation !== formation) return false;

      if (eventType !== "ALL") {
        const events = offset.historical_events ?? [];
        const hit = events.some(
          (event) =>
            String(event?.event ?? "")
              .toLowerCase()
              .includes(eventType.toLowerCase().split(" ")[0])
        );
        if (!hit) return false;
      }

      if (term) {
        const haystack = [
          offset.well_id,
          offset.formation,
          offset.trajectory,
          offset.hole_section
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });

    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sort === "distance") {
        return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
      }
      if (sort === "events") {
        return (
          (b.historical_event_count ?? 0) - (a.historical_event_count ?? 0)
        );
      }
      if (sort === "well") {
        return String(a.well_id).localeCompare(String(b.well_id));
      }
      return (b.similarity_score ?? 0) - (a.similarity_score ?? 0);
    });

    return sorted;
  }, [
    offsets,
    query,
    maxDistance,
    minSimilarity,
    formation,
    eventType,
    sort
  ]);

  return (
    <>
      {diagnostics?.statement ? (
        <div
          className="banner banner--info"
          data-sev={diagnostics.nearest_is_top_ranked ? "medium" : "info"}
        >
          <IconRoute
            size={14}
            className="banner__icon"
          />
          <div className="banner__body">
            <span className="banner__title">
              This is not a nearest-well lookup
            </span>
            <span className="banner__text">
              {diagnostics.statement}
            </span>
            {diagnostics.nearest_is_top_ranked === false ? (
              <span className="banner__text banner__text--mono">
                nearest {fmtLabel(diagnostics.nearest_well)} (rank{" "}
                {diagnostics.nearest_rank} of{" "}
                {diagnostics.candidates_scored}) → top{" "}
                {fmtLabel(diagnostics.top_ranked_well)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="filters">
        <div className="field" style={{ gridColumn: "span 2", minWidth: 140 }}>
          <label className="field__label" htmlFor="offset-search">
            Search
          </label>
          <input
            id="offset-search"
            className="input"
            type="search"
            value={query}
            placeholder="WELL-017, horizontal, 12.25…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="offset-sort">
            <IconSort size={10} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
            Sort
          </label>
          <select
            id="offset-sort"
            className="select"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="offset-formation">
            <IconFilter size={10} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
            Formation
          </label>
          <select
            id="offset-formation"
            className="select"
            value={formation}
            onChange={(event) => setFormation(event.target.value)}
          >
            <option value="ALL">All formations</option>
            {formations.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="offset-event">
            Event type
          </label>
          <select
            id="offset-event"
            className="select"
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
          >
            <option value="ALL">Any event</option>
            {EVENT_TYPES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="offset-distance">
            Max distance <b>{maxDistance} km</b>
          </label>
          <input
            id="offset-distance"
            className="range"
            type="range"
            min={1}
            max={50}
            step={1}
            value={maxDistance}
            onChange={(event) => setMaxDistance(Number(event.target.value))}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="offset-similarity">
            Min similarity <b>{minSimilarity}%</b>
          </label>
          <input
            id="offset-similarity"
            className="range"
            type="range"
            min={0}
            max={100}
            step={5}
            value={minSimilarity}
            onChange={(event) => setMinSimilarity(Number(event.target.value))}
          />
        </div>
      </div>

      {activeFormation ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--s-4)",
            fontSize: "var(--fs-xs)",
            color: "var(--text-faint)"
          }}
        >
          <IconSearch size={12} />
          Ranking the {offsets.length} nearest analogues of{" "}
          <strong style={{ color: "var(--text-mid)" }}>{fmtLabel(activeFormation)}</strong>
          {" · "}
          {filtered.length} shown
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          compact
          severity="info"
          title="No offsets match these filters"
          message="Relax the distance, similarity, formation or event filter to see the remaining analogues."
          action={
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setQuery("");
                setMaxDistance(50);
                setMinSimilarity(0);
                setFormation("ALL");
                setEventType("ALL");
              }}
            >
              Reset filters
            </button>
          }
        />
      ) : (
        <div className="well-list" style={{ border: "1px solid var(--line-soft)", borderRadius: "var(--r-2)" }}>
          {filtered.map((offset) => {
            const tier = similarityTier(offset.similarity_score);
            const selected = offset.well_id === selectedWellId;
            const factors = offset.factors ?? null;
            const topFactor = factors
              ? Object.values(factors)
                  .filter((f) => f.available)
                  .sort(
                    (a, b) => (b.score ?? 0) - (a.score ?? 0)
                  )[0]
              : null;

            return (
              <button
                type="button"
                className="well-row"
                key={offset.well_id}
                onClick={() => {
                  onSelectWell?.(offset);
                  onOpenWell?.(offset);
                }}
                aria-selected={selected}
                title={
                  topFactor
                    ? `Strongest factor: ${topFactor.label} — ${topFactor.detail}`
                    : undefined
                }
              >
                <span className="well-row__rank">
                  {String(offsets.indexOf(offset) + 1).padStart(2, "0")}
                </span>

                <span className="well-row__id">
                  <strong>{fmtLabel(offset.well_id)}</strong>
                  <span>
                    {fmtLabel(offset.formation)} · {fmtLabel(offset.trajectory)}
                  </span>
                </span>

                <span className="well-row__sim">
                  <span className="well-row__sim-head">
                    <span>
                      {topFactor
                        ? `top factor: ${topFactor.label}`
                        : "similarity"}
                    </span>
                    <b>{percent(offset.similarity_score, 1)}</b>
                  </span>
                  <span
                    className="well-row__sim-bar"
                    style={{ "--sim-color": tier.color }}
                  >
                    <span style={{ width: `${offset.similarity_score ?? 0}%` }} />
                  </span>
                </span>

                <span className="well-row__stat well-row__stat--events">
                  {km(offset.distance_km)}
                </span>

                <span className="well-row__stat">
                  <b>{offset.historical_event_count ?? 0}</b> event
                  {offset.historical_event_count === 1 ? "" : "s"}
                </span>

                <IconChevronRight size={13} className="well-row__chevron" />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export const OffsetExplorer = memo(OffsetExplorerBase);
export default OffsetExplorer;
