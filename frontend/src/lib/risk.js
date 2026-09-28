/* =========================================================
   NWIS — RISK VOCABULARY & SIGNAL DEFINITIONS
   The four severity bands below are the exact thresholds
   used by ml/risk_engine.calculate_risk and by the
   /api/simulation + /api/nwis endpoints. Keeping one table
   means the UI can never disagree with the backend.
   ========================================================= */

export const RISK_BANDS = [
  {
    key: "low",
    level: "LOW",
    range: "0 – 29",
    min: 0,
    max: 30,
    color: "var(--ok)",
    meaning: "Parameters within expected envelope"
  },
  {
    key: "medium",
    level: "MEDIUM",
    range: "30 – 54",
    min: 30,
    max: 55,
    color: "var(--warn)",
    meaning: "Early precursor present; increase observation"
  },
  {
    key: "high",
    level: "HIGH",
    range: "55 – 74",
    min: 55,
    max: 75,
    color: "var(--high)",
    meaning: "Multiple precursors; escalate to supervisor"
  },
  {
    key: "critical",
    level: "CRITICAL",
    range: "75 – 100",
    min: 75,
    max: 100,
    color: "var(--crit)",
    meaning: "Intervention pathway should be reviewed"
  }
];

const BAND_BY_KEY = new Map(RISK_BANDS.map((b) => [b.key, b]));

export function bandForScore(score) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return BAND_BY_KEY.get("low");
  }
  const clamped = Math.max(0, Math.min(100, score));
  for (let i = RISK_BANDS.length - 1; i >= 0; i -= 1) {
    if (clamped >= RISK_BANDS[i].min) return RISK_BANDS[i];
  }
  return RISK_BANDS[0];
}

export function severityKey(level) {
  if (typeof level !== "string") return "none";
  const value = level.trim().toLowerCase();
  if (value === "low") return "low";
  if (value === "medium" || value === "moderate") return "medium";
  if (value === "high") return "high";
  if (value === "critical" || value === "severe") return "critical";
  if (value === "info") return "info";
  return "none";
}

export function bandForLevel(level) {
  return BAND_BY_KEY.get(severityKey(level)) ?? null;
}

/* Historical incident severity uses the source vocabulary
   (Severe / Moderate / …). Map it onto the same four colours
   without rewriting the words shown to the operator. */
export function severityFromHistorical(severity) {
  if (typeof severity !== "string") return "none";
  const value = severity.trim().toLowerCase();
  if (value.includes("severe")) return "critical";
  if (value.includes("moderate")) return "medium";
  if (value.includes("minor") || value.includes("low")) return "low";
  return "none";
}

/* =========================================================
   SIMULATED DRILLING PARAMETERS
   ========================================================= */

export const SIGNALS = [
  {
    key: "rop",
    name: "ROP",
    longName: "Rate of penetration",
    unit: "m/hr",
    digits: 1,
    domain: [0, 34],
    // A falling ROP is the adverse direction for this parameter.
    direction: "down",
    warnAbove: null,
    warnBelow: 18,
    what: "Falling ROP with a static or rising surface weight suggests the formation is not being cut efficiently — a classic stuck-pipe or pack-off precursor."
  },
  {
    key: "torque",
    name: "TORQUE",
    longName: "Surface torque",
    unit: "kN·m",
    digits: 1,
    domain: [8, 36],
    direction: "up",
    warnAbove: 20,
    warnBelow: null,
    what: "Rising torque at constant depth is the strongest mechanical precursor in the current signal set."
  },
  {
    key: "ecd",
    name: "ECD",
    longName: "Equivalent circulating density",
    unit: "sg",
    digits: 3,
    domain: [1.1, 1.34],
    direction: "up",
    warnAbove: 1.22,
    warnBelow: null,
    what: "Rising ECD narrows the drilling window between collapse and fracture pressure."
  },
  {
    key: "pit_volume",
    name: "PIT",
    longName: "Active pit volume",
    unit: "bbl",
    digits: 1,
    domain: [88, 106],
    direction: "down",
    warnAbove: null,
    warnBelow: 97,
    what: "A falling pit volume while drilling continues is consistent with fluid loss to the formation."
  }
];

export const SIGNAL_BY_KEY = new Map(SIGNALS.map((s) => [s.key, s]));

/* The backend's own precursor thresholds (ml/risk_engine.py). */
export const PRECURSOR_RULE_TEXT = {
  "ROP decreasing significantly": "ROP drop above 20% across the rolling window",
  "Torque increasing": "Torque rise above 15% across the rolling window",
  "ECD increasing": "ECD rise above 0.03 sg across the rolling window",
  "Pit-volume decrease detected": "Pit-volume drop above 3% across the rolling window",
  "No significant precursor detected": "No rolling-window threshold crossed",
  "Waiting for sufficient drilling data": "Fewer than 5 records in the window"
};

export function signalAdverse(signal, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (signal.warnAbove !== null) return value > signal.warnAbove;
  if (signal.warnBelow !== null) return value < signal.warnBelow;
  return false;
}

/* Map a backend reason string onto the parameter it came from so the
   UI can show the real signal delta next to the real reason. */
const REASON_SIGNAL = [
  [/rop/i, "rop"],
  [/torque|drag/i, "torque"],
  [/ecd/i, "ecd"],
  [/pit/i, "pit_volume"]
];

export function signalForReason(reason) {
  if (typeof reason !== "string") return null;
  const hit = REASON_SIGNAL.find(([pattern]) => pattern.test(reason));
  return hit ? SIGNAL_BY_KEY.get(hit[1]) : null;
}

/* risk.signals from /api/nwis uses percentage keys except ECD. */
export function signalDelta(signalKey, signals) {
  if (!signals || typeof signals !== "object") return null;
  const map = {
    rop: signals.rop_drop,
    torque: signals.torque_rise,
    ecd: signals.ecd_rise,
    pit_volume: signals.pit_drop
  };
  const value = map[signalKey];
  return typeof value === "number" ? value : null;
}

export function formatSignalDelta(signalKey, signals) {
  const value = signalDelta(signalKey, signals);
  if (value === null) return null;
  if (signalKey === "ecd") return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(3)} sg`;
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(0)}%`;
}

/* =========================================================
   SIMILARITY TIERS (offset-well ranking display only)
   ========================================================= */

export function similarityTier(score) {
  if (typeof score !== "number") return { key: "unknown", color: "var(--neutral)" };
  if (score >= 70) return { key: "strong", color: "var(--warn)" };
  if (score >= 55) return { key: "moderate", color: "var(--info)" };
  return { key: "weak", color: "var(--neutral)" };
}

export const SIMILARITY_LEGEND = [
  { key: "strong", label: "Strong analogue", hint: "≥ 70", color: "var(--warn)" },
  { key: "moderate", label: "Comparable", hint: "55 – 69", color: "var(--info)" },
  { key: "weak", label: "Weak analogue", hint: "< 55", color: "var(--neutral)" }
];
