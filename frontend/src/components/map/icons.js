import L from "leaflet";

/* =========================================================
   MAP MARKER FACTORY
   DivIcons are cached by their option signature: Leaflet
   markers are recreated on every data change otherwise, and
   30 cached icons is dramatically cheaper than 30 fresh DOM
   subtrees per second.
   ========================================================= */

const cache = new Map();

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function wellIcon({
  label,
  color = "var(--info)",
  active = false,
  selected = false,
  correlated = false,
  labelSide = "right",
  showLabel = true
}) {
  const signature = [
    label,
    color,
    active ? 1 : 0,
    selected ? 1 : 0,
    correlated ? 1 : 0,
    labelSide,
    showLabel ? 1 : 0
  ].join("|");

  const hit = cache.get(signature);
  if (hit) return hit;

  const classes = [
    "well-marker",
    active ? "well-marker--active" : "",
    selected ? "is-selected" : "",
    correlated ? "well-marker--correlated" : "",
    labelSide === "left" ? "well-marker--below" : "",
    showLabel ? "" : "well-marker--terse"
  ]
    .filter(Boolean)
    .join(" ");

  const size = active ? 34 : 24;

  const html = `
    <div class="well-marker__pin" style="--pin:${color}">
      ${active ? '<span class="well-marker__crosshair"></span><span class="well-marker__pulse"></span>' : ""}
      <span class="well-marker__dot"></span>
      ${correlated ? '<span class="well-marker__event"></span>' : ""}
      ${showLabel ? `<span class="well-marker__label">${escapeHtml(label)}</span>` : ""}
    </div>
  `;

  const icon = L.divIcon({
    className: classes,
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });

  cache.set(signature, icon);
  return icon;
}

export function distanceLabel(distanceKm, tier) {
  const signature = `dist|${distanceKm}|${tier}`;
  const hit = cache.get(signature);
  if (hit) return hit;

  const icon = L.divIcon({
    className: "dist-label",
    html: `<b>${escapeHtml(Number(distanceKm).toFixed(2))}</b> km`,
    iconSize: [64, 14],
    /* Lifted clear of the well tag, which sits on the marker
       centre line. */
    iconAnchor: [32, 22]
  });

  cache.set(signature, icon);
  return icon;
}

export function clearIconCache() {
  cache.clear();
}
