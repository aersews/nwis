import { memo, useEffect, useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import { similarityTier } from "../../lib/risk.js";
import { bandForScore } from "../../lib/risk.js";
import { km, label as fmtLabel, percent } from "../../lib/format.js";
import { distanceLabel, wellIcon } from "./icons.js";
import { MapFit, MapFocus, MapResizer } from "./MapControls.jsx";
import { RadiusControl } from "./RadiusControl.jsx";
import { MapLegend } from "./MapLegend.jsx";
import { ErrorState } from "../common/States.jsx";
import {
  IconGrid,
  IconMaximize,
  IconSatellite
} from "../common/Icons.jsx";

/* Both basemaps are keyless public endpoints. The dark reference
   map is derived from the standard OSM raster with a luminance
   transform in CSS, which keeps the interface on a single dark
   palette without shipping a keyed provider. */
const BASEMAPS = {
  dark: {
    label: "Dark reference",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    filter: "dark",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · luminance-filtered for legibility'
  },
  satellite: {
    label: "Satellite",
    url: "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    filter: "satellite",
    attribution: "Imagery &copy; Google · well positions are synthetic"
  }
};

const TILE_FAILURE_LIMIT = 3;

function WellMapBase({
  activeWell,
  activeDepth,
  activeFormation,
  activeScore,
  offsets = [],
  correlatedWellIds = new Set(),
  selectedWellId,
  onSelectWell,
  onOpenWell,
  radiusKm,
  onRadiusChange,
  fitTrigger = 0
}) {
  const [basemap, setBasemap] = useState("dark");
  const [tileErrors, setTileErrors] = useState(0);
  const [fitNonce, setFitNonce] = useState(0);
  const failed = tileErrors >= TILE_FAILURE_LIMIT;

  const center = useMemo(
    () =>
      activeWell
        ? [activeWell.latitude, activeWell.longitude]
        : null,
    [activeWell]
  );

  useEffect(() => {
    setTileErrors(0);
  }, [basemap]);

  const activeBand = bandForScore(activeScore);
  const visible = useMemo(
    () =>
      offsets.filter(
        (o) =>
          typeof o.latitude === "number" && typeof o.longitude === "number"
      ),
    [offsets]
  );
  const withinRadius = useMemo(
    () => visible.filter((o) => (o.distance_km ?? Infinity) <= radiusKm),
    [visible, radiusKm]
  );

  /* Labels are reserved for the strongest analogues, any well
     that carries a depth-window match, and the current selection.
     Everything else stays identifiable on hover, so the map does
     not collapse into a wall of overlapping tags. */
  const labelled = useMemo(() => {
    const set = new Set();
    withinRadius
      .filter(
        (o) => correlatedWellIds.has(o.well_id) || o.well_id === selectedWellId
      )
      .forEach((o) => set.add(o.well_id));

    const ranked = [...withinRadius].sort(
      (a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0)
    );
    for (const offset of ranked) {
      if (set.size >= 4) break;
      set.add(offset.well_id);
    }
    return set;
  }, [withinRadius, correlatedWellIds, selectedWellId]);

  const allPoints = useMemo(
    () => [
      ...(center ? [center] : []),
      ...withinRadius.map((o) => [o.latitude, o.longitude])
    ],
    [center, withinRadius]
  );

  if (!activeWell || center === null) {
    return (
      <div className="map">
        <div className="map__frame">
          <ErrorState
            compact
            title="Map position unavailable"
            message="The active well has no coordinates in /api/wells, so the geospatial view cannot be drawn."
          />
        </div>
      </div>
    );
  }

  const onTileError = () => setTileErrors((n) => n + 1);

  return (
    <div className={`map${failed ? " is-schematic" : ""}`}>
      <div
        className={`map__frame${
          !failed && BASEMAPS[basemap] ? ` map__frame--${BASEMAPS[basemap].filter}` : ""
        }`}
      >
        <MapContainer
          center={center}
          zoom={12}
          minZoom={4}
          maxZoom={18}
          scrollWheelZoom
          zoomControl
          attributionControl
        >
          {!failed && basemap ? (
            <TileLayer
              key={basemap}
              url={BASEMAPS[basemap].url}
              attribution={BASEMAPS[basemap].attribution}
              eventHandlers={{ tileerror: onTileError }}
              maxZoom={19}
              crossOrigin
            />
          ) : null}

          <Circle
            center={center}
            radius={radiusKm * 1000}
            pathOptions={{
              color: "#4d9dff",
              weight: 1,
              opacity: 0.4,
              fillColor: "#4d9dff",
              fillOpacity: 0.04,
              dashArray: "4 6"
            }}
          />

          {withinRadius.map((offset) => {
            const tier = similarityTier(offset.similarity_score);
            const correlated = correlatedWellIds.has(offset.well_id);
            const selected = offset.well_id === selectedWellId;
            const labelSide =
              offset.longitude >= activeWell.longitude ? "right" : "left";

            return (
              <Marker
                key={offset.well_id}
                position={[offset.latitude, offset.longitude]}
                icon={wellIcon({
                  label: offset.well_id,
                  color: tier.color,
                  selected,
                  correlated,
                  labelSide,
                  showLabel: labelled.has(offset.well_id)
                })}
                zIndexOffset={correlated ? 400 : selected ? 300 : 0}
                eventHandlers={{
                  click: () => {
                    onSelectWell?.(offset);
                    onOpenWell?.(offset);
                  }
                }}
              >
                <Tooltip direction="top" offset={[0, -12]} opacity={1}>
                  <strong>{offset.well_id}</strong>
                  <br />
                  {km(offset.distance_km)} · {percent(offset.similarity_score, 1)} similar
                  <br />
                  {fmtLabel(offset.formation)} ·{" "}
                  {fmtLabel(offset.trajectory)} · {offset.hole_section}
                  <br />
                  {offset.historical_event_count ?? 0} historical event
                  {(offset.historical_event_count ?? 0) === 1 ? "" : "s"} in formation
                  {correlated ? (
                    <>
                      <br />
                      <b>Event inside the current depth window</b>
                    </>
                  ) : null}
                </Tooltip>
              </Marker>
            );
          })}

          <Polyline
            positions={withinRadius.map((o) => [
              o.latitude,
              o.longitude
            ])}
            pathOptions={{
              color: "#4d9dff",
              weight: 1,
              opacity: 0.28,
              dashArray: "2 5"
            }}
          />

          {withinRadius.map((offset) => {
            /* Alternating the badge along the link spreads the
               labels out instead of stacking them at the centre. */
            const t =
              offset.latitude >= activeWell.latitude ? 0.34 : 0.62;
            return (
              <Marker
                key={`dist-${offset.well_id}`}
                position={[
                  activeWell.latitude + (offset.latitude - activeWell.latitude) * t,
                  activeWell.longitude +
                    (offset.longitude - activeWell.longitude) * t
                ]}
                interactive={false}
                keyboard={false}
                alt=""
                icon={distanceLabel(
                  offset.distance_km,
                  similarityTier(offset.similarity_score).key
                )}
                zIndexOffset={-200}
              />
            );
          })}

          <Marker
            position={center}
            icon={wellIcon({
              label: `${activeWell.well_id} · ${Math.round(activeDepth ?? 0)} m`,
              color: activeBand.color,
              active: true
            })}
            zIndexOffset={600}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              <strong>ACTIVE WELL · {activeWell.well_id}</strong>
              <br />
              {fmtLabel(activeFormation)} · {Math.round(activeDepth ?? 0)} m
              <br />
              Live risk index {Math.round(activeScore ?? 0)} / 100 ·{" "}
              {activeBand.level}
            </Tooltip>
          </Marker>

          <MapResizer deps={[withinRadius.length, radiusKm]} />
          <MapFocus center={center} zoom={12} trigger="init" />
          <MapFit points={allPoints} trigger={fitNonce || fitTrigger} />
        </MapContainer>

        <div className="map__overlay map__overlay--tl">
          <span className="map-chip">
            <b>{withinRadius.length}</b> of {visible.length} offsets in range
          </span>
        </div>

        <div className="map__overlay map__overlay--tr">
          <div className="btn-group">
            <button
              type="button"
              className="btn btn--icon"
              aria-pressed={basemap === "dark" && !failed}
              onClick={() => setBasemap("dark")}
              title="Dark reference basemap"
              aria-label="Dark reference basemap"
            >
              <IconGrid size={13} />
            </button>
            <button
              type="button"
              className="btn btn--icon"
              aria-pressed={basemap === "satellite" && !failed}
              onClick={() => setBasemap("satellite")}
              title="Satellite imagery basemap"
              aria-label="Satellite imagery basemap"
            >
              <IconSatellite size={13} />
            </button>
            <button
              type="button"
              className="btn btn--icon"
              aria-pressed={basemap === "schematic" || failed}
              onClick={() => setBasemap("schematic")}
              title="Schematic view — no imagery tiles"
              aria-label="Schematic view without imagery"
            >
              <IconMaximize size={13} />
            </button>
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => setFitNonce((n) => n + 1)}
              title="Fit all offsets in view"
              aria-label="Fit all offsets in view"
            >
              <IconMaximize size={13} />
            </button>
          </div>
        </div>

        <div className="map__overlay map__overlay--bl">
          <MapLegend
            failed={failed}
            correlatedCount={correlatedWellIds.size}
            activeBand={activeBand}
          />
        </div>

        <div className="map__overlay map__overlay--br">
          <RadiusControl value={radiusKm} onChange={onRadiusChange} />
        </div>
      </div>
    </div>
  );
}

export const WellMap = memo(WellMapBase);
export default WellMap;
