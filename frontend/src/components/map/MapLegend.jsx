import { memo } from "react";

import { SIMILARITY_LEGEND } from "../../lib/risk.js";

/**
 * What the marker colours mean. The legend is explicit because
 * colour alone must never carry the meaning, and it is written
 * so the same wording stays legible when the map narrows.
 */
export const MapLegend = memo(function MapLegend({
  failed = false,
  correlatedCount = 0,
  activeBand
}) {
  return (
    <div className="map-legend">
      <span className="map-legend__title">Marker key</span>

      <span className="map-legend__row">
        <i
          className="map-legend__swatch map-legend__swatch--dot"
          style={{ "--swatch": activeBand?.color ?? "var(--ok)" }}
          aria-hidden="true"
        />
        Active well
        <b>{activeBand?.level ?? "n/a"}</b>
      </span>

      {SIMILARITY_LEGEND.map((tier) => (
        <span
          key={tier.key}
          className={`map-legend__row map-legend__row--${tier.key}`}
        >
          <i
            className="map-legend__swatch"
            style={{ "--swatch": tier.color }}
            aria-hidden="true"
          />
          {tier.label}
          <b>{tier.hint}</b>
        </span>
      ))}

      <span className="map-legend__row map-legend__row--event">
        <i
          className="map-legend__swatch map-legend__swatch--ring"
          style={{ "--swatch": "var(--crit)" }}
          aria-hidden="true"
        />
        Event in window
        <b>{correlatedCount}</b>
      </span>

      <span className="map-legend__row map-legend__row--synthetic">
        <i
          className="map-legend__swatch map-legend__swatch--dot"
          style={{ "--swatch": "transparent", border: "1px solid var(--info)" }}
          aria-hidden="true"
        />
        Synthetic coordinates
      </span>

      {failed ? (
        <span
          className="map-legend__row map-legend__row--offline"
          style={{ color: "var(--warn)" }}
        >
          Basemap offline — schematic grid
        </span>
      ) : null}
    </div>
  );
});

export default MapLegend;
