/* =========================================================
   NWIS — FORMATTING
   Every helper is null-safe: missing fields render as
   "Not available" rather than as a fabricated value.
   ========================================================= */

export const NOT_AVAILABLE = "Not available";

export const isNum = (value) =>
  typeof value === "number" && Number.isFinite(value);

export function num(value, digits = 1, fallback = NOT_AVAILABLE) {
  if (!isNum(value)) return fallback;
  return value.toFixed(digits);
}

export function int(value, fallback = NOT_AVAILABLE) {
  if (!isNum(value)) return fallback;
  return Math.round(value).toLocaleString("en-US");
}

export function km(value, fallback = NOT_AVAILABLE) {
  if (!isNum(value)) return fallback;
  return `${value.toFixed(2)} km`;
}

export function metres(value, digits = 1, fallback = NOT_AVAILABLE) {
  if (!isNum(value)) return fallback;
  return `${value.toFixed(digits)} m`;
}

export function percent(value, digits = 0, fallback = NOT_AVAILABLE) {
  if (!isNum(value)) return fallback;
  return `${value.toFixed(digits)}%`;
}

/* A cosine similarity is 0..1 — present it as a percentage but
   never as a "confidence" or "probability". */
export function similarity(value, fallback = NOT_AVAILABLE) {
  if (!isNum(value)) return fallback;
  return `${Math.round(value * 100)}%`;
}

export function signed(value, digits = 1, unit = "") {
  if (!isNum(value)) return NOT_AVAILABLE;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}${unit}`;
}

export function timeOfDay(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "--:--:--";
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

export function dateStamp(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

export function relativeTime(from, now = Date.now()) {
  if (!isNum(from)) return NOT_AVAILABLE;
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 2) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

export function clockFromIso(iso) {
  if (typeof iso !== "string") return NOT_AVAILABLE;
  const match = iso.match(/T(\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : NOT_AVAILABLE;
}

export function titleCase(value) {
  if (typeof value !== "string" || !value.trim()) return NOT_AVAILABLE;
  return value
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/* Preserve the backend's own vocabulary (e.g. "Stuck Pipe",
   "SEVERE", "Formation-Y") instead of re-formatting it. */
export function label(value, fallback = NOT_AVAILABLE) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed === "UNKNOWN") return "Not recorded";
  return trimmed;
}

export function basename(path) {
  if (typeof path !== "string") return NOT_AVAILABLE;
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function shortId(value) {
  if (typeof value !== "string") return NOT_AVAILABLE;
  return value.length > 22 ? `${value.slice(0, 20)}…` : value;
}

export function pluralise(count, singular, plural) {
  if (!isNum(count)) return singular;
  return count === 1 ? singular : plural ?? `${singular}s`;
}

export function listSentence(items, conjunction = "and") {
  const clean = (items ?? []).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} ${conjunction} ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} ${conjunction} ${clean[clean.length - 1]}`;
}

/* Highlight search hits without ever injecting raw HTML. */
export function splitHighlight(text, terms) {
  const value = typeof text === "string" ? text : "";
  const clean = (terms ?? []).filter((t) => typeof t === "string" && t.length > 1);
  if (!clean.length) return [{ text: value, hit: false }];

  const pattern = new RegExp(
    `(${clean.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );

  return value
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({
      text: part,
      hit: clean.some((t) => t.toLowerCase() === part.toLowerCase())
    }));
}
