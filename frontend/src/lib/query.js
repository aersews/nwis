/* =========================================================
   NWIS — QUERY INTERPRETER
   Global search lets the engineer type plain language
   ("stuck pipe near 2800 m", "Formation-Y mud losses").
   This module only *reads* the query and derives filters —
   every result it produces is still a real row from
   /api/wells, /api/events, /api/documents or the FAISS
   index behind /api/rag/search. The parsed intent is shown
   to the user so the interpretation is never a black box.
   ========================================================= */

import { isNum } from "./format.js";

const EVENT_SYNONYMS = [
  {
    key: "stuck pipe",
    terms: [
      "stuck pipe",
      "stuck-pipe",
      "stuckpipe",
      "stuck",
      "differential sticking",
      "pack-off"
    ]
  },
  {
    key: "lost circulation",
    terms: [
      "lost circulation",
      "loss circulation",
      "circulation loss",
      "mud loss",
      "mud losses",
      "mudloss",
      "losses",
      "lostcirc",
      "lcm"
    ]
  },
  {
    key: "kick",
    terms: ["kick", "kicks", "influx", "well control", "wellcontrol"]
  }
];

const SIGNAL_SYNONYMS = [
  { key: "torque", terms: ["torque", "drag", "rotating torque", "torque problems", "overpull"] },
  { key: "rop", terms: ["rop", "rate of penetration", "penetration rate", "penetration"] },
  { key: "ecd", terms: ["ecd", "equivalent circulating density", "equivalent density"] },
  { key: "pit volume", terms: ["pit volume", "pit-volume", "pitvolume", "pit", "pit gain", "pit loss"] }
];

const STOP_WORDS = new Set([
  "a", "an", "the", "of", "for", "in", "on", "at", "to", "with", "and", "or",
  "near", "around", "about", "approximately", "show", "find", "list", "search",
  "any", "all", "is", "are", "was", "were", "me", "my", "please", "history",
  "historical", "well", "wells", "event", "events", "document", "documents",
  "evidence", "report", "reports", "m", "metre", "metres", "meter", "meters",
  "depths", "problems", "issue", "issues"
]);

const UNITS = new Set([
  "m", "meters", "metres", "meter", "ft", "feet", "md", "tvd"
]);

export function tokenize(query) {
  return (query ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\-./"']+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function matchSynonyms(tokens, table) {
  const joined = tokens.join(" ");
  const found = [];
  for (const entry of table) {
    if (entry.terms.some((term) => joined.includes(term))) found.push(entry.key);
  }
  return found;
}

function matchPhrases(tokens, table) {
  const found = [];
  for (const entry of table) {
    for (const term of entry.terms) {
      const parts = term.split(" ");
      if (parts.every((p, i) => tokens[i] === p)) {
        found.push(entry.key);
        break;
      }
    }
  }
  return found;
}

export function interpret(raw) {
  const query = (raw ?? "").trim();
  const lower = query.toLowerCase();
  const tokens = tokenize(query);

  /* ---- well identifier ---- */
  const wellMatch = lower.match(/\bwell[\s#:_-]*(\d{1,4})\b/);
  const wellId = wellMatch ? `WELL-${String(wellMatch[1]).padStart(3, "0")}` : null;

  /* ---- formation ---- */
  const formationMatch = lower.match(/\bformation[\s#:_-]*([a-z])\b/);
  const formation = formationMatch
    ? `Formation-${formationMatch[1].toUpperCase()}`
    : null;

  /* ---- depth + "near/around" intent ----
     A bare number that is part of a well identifier is not a
     depth, so the two are never read from the same token. */
  const depthMatch = wellId
    ? null
    : lower.match(
        /(\d{3,5}(?:[.]\\d+)?)\s*(m\b|meters?\b|metres?\b|ft\b|feet\b|md\b|tvd\b)?/
      );
  let depth = depthMatch ? Number(depthMatch[1]) : null;
  if (depth !== null && !Number.isFinite(depth)) depth = null;
  if (isNum(depth) && depth > 20_000) depth = null;

  const wantsDepthWindow =
    /\b(near|around|at|close to|adjacent to)\b/.test(lower) && depth !== null;
  const wantsCurrentDepth =
    /\bcurrent depth\b|\bnearby depth\b/.test(lower) && depth === null;

  /* ---- event / signal intent ----
     Phrase matches are exact; contains-matches are a forgiving
     fallback for shorthand like "mud losses". */
  const eventTerms = Array.from(
    new Set([
      ...matchPhrases(tokens, EVENT_SYNONYMS),
      ...matchSynonyms(tokens, EVENT_SYNONYMS)
    ])
  );

  const signalTerms = Array.from(
    new Set([
      ...matchPhrases(tokens, SIGNAL_SYNONYMS),
      ...matchSynonyms(tokens, SIGNAL_SYNONYMS)
    ])
  );

  /* ---- meaningful free-text terms ---- */
  const freeTerms = tokens.filter(
    (t) =>
      t.length > 1 &&
      !STOP_WORDS.has(t) &&
      !UNITS.has(t) &&
      !/^\d+$/.test(t) &&
      !(wellId && wellId.toLowerCase() === t)
  );

  /* ---- severity filter ---- */
  const severityMatch = lower.match(/\b(severe|moderate|minor|critical|high|medium|low)\b/);
  const severity = severityMatch ? severityMatch[1] : null;

  /* ---- human-readable interpretation for the UI ---- */
  const interpretations = [];
  if (wellId) interpretations.push({ kind: "well", text: `Well ${wellId}` });
  if (formation) interpretations.push({ kind: "formation", text: formation });
  if (isNum(depth)) {
    interpretations.push({
      kind: "depth",
      text: wantsDepthWindow
        ? `Depth ≈ ${Math.round(depth)} m (±50 m)`
        : `Depth ${Math.round(depth)} m`
    });
  }
  if (wantsCurrentDepth) {
    interpretations.push({ kind: "depth", text: "Depth window around current bit depth" });
  }
  if (eventTerms.length) {
    interpretations.push({ kind: "event", text: `Event: ${eventTerms.join(", ")}` });
  }
  if (signalTerms.length) {
    interpretations.push({ kind: "signal", text: `Signal: ${signalTerms.join(", ")}` });
  }

  /* ---- the semantic query handed to the real FAISS index ---- */
  const ragParts = [
    "historical drilling",
    formation,
    isNum(depth) ? `around ${Math.round(depth)} meters` : null,
    eventTerms.length ? eventTerms.join(" ") : signalTerms.join(" "),
    "risk mitigation lesson learned"
  ].filter(Boolean);

  return {
    raw: query,
    isEmpty: query.length === 0,
    wellId,
    formation,
    depth,
    wantsDepthWindow,
    wantsCurrentDepth,
    eventTerms,
    signalTerms,
    severity,
    freeTerms,
    interpretations,
    ragQuery: ragParts.join(" ")
  };
}

export function matchesEvent(eventRecord, parsed) {
  if (!eventRecord) return false;
  const haystack = [
    eventRecord.event,
    eventRecord.severity,
    eventRecord.formation,
    eventRecord.well_id,
    eventRecord.mitigation,
    eventRecord.precursors
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (parsed.wellId && eventRecord.well_id !== parsed.wellId) return false;
  if (parsed.formation && eventRecord.formation !== parsed.formation) return false;
  if (parsed.severity && !haystack.includes(parsed.severity)) return false;

  if (isNum(parsed.depth) && parsed.wantsDepthWindow) {
    const tolerance = 50;
    if (
      !isNum(eventRecord.depth) ||
      Math.abs(eventRecord.depth - parsed.depth) > tolerance
    ) {
      return false;
    }
  }

  if (parsed.eventTerms.length) {
    return parsed.eventTerms.some((term) => haystack.includes(term));
  }

  if (parsed.signalTerms.length) {
    return parsed.signalTerms.some((term) => haystack.includes(term));
  }

  if (parsed.freeTerms.length) {
    return parsed.freeTerms.some((term) => haystack.includes(term));
  }

  return false;
}

export function matchesWell(wellRecord, parsed) {
  if (!wellRecord) return false;
  const haystack = [
    wellRecord.well_id,
    wellRecord.formation,
    wellRecord.trajectory,
    wellRecord.hole_section
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (parsed.wellId) return wellRecord.well_id === parsed.wellId;
  if (parsed.freeTerms.length) {
    return parsed.freeTerms.some((term) => haystack.includes(term));
  }
  return false;
}
