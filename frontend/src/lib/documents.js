/* =========================================================
   NWIS — DOCUMENT SECTION PARSER
   The indexed reports follow a "LABEL: value" field layout.
   Splitting them into labelled sections is presentation only:
   the stored chunk text is never modified.
   ========================================================= */

const LABEL = /\b([A-Z][A-Z /-]{2,32}):\s*/g;

const ORDERED_FIELDS = [
  "WELL",
  "FORMATION",
  "DEPTH",
  "EVENT",
  "SEVERITY",
  "DATE"
];

const NARRATIVE_LABELS = [
  "DRILLING OBSERVATION",
  "OBSERVATION",
  "MITIGATION",
  "LESSON LEARNED",
  "CONCLUSION",
  "RECOMMENDATION",
  "NOTES"
];

function normalise(label) {
  return label.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Returns an ordered list of { label, value } pairs. Unlabelled
 * prose is preserved under a "Document text" heading rather than
 * being dropped.
 */
export function splitSections(text) {
  if (typeof text !== "string" || !text.trim()) return [];

  const marks = [];
  let match = LABEL.exec(text);
  while (match !== null) {
    marks.push({
      label: normalise(match[1]),
      start: match.index,
      valueStart: match.index + match[0].length
    });
    match = LABEL.exec(text);
  }

  if (marks.length === 0) {
    return [{ label: "Document text", value: text.trim() }];
  }

  const sections = marks.map((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1].start : text.length;
    return {
      label: mark.label,
      value: text.slice(mark.valueStart, end).trim()
    };
  });

  const known = new Set([...ORDERED_FIELDS, ...NARRATIVE_LABELS]);
  const isField = (label) =>
    ORDERED_FIELDS.includes(label) && sections.length > 1;

  return sections
    .filter((section) => section.value.length > 0 || isField(section.label))
    .sort((a, b) => {
      const ai = ORDERED_FIELDS.indexOf(a.label);
      const bi = ORDERED_FIELDS.indexOf(b.label);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }
      return 0;
    })
    .map((section) =>
      isField(section.label) || known.has(section.label)
        ? section
        : { ...section, label: section.label }
    );
}

export function fieldValue(sections, field) {
  const hit = sections.find(
    (s) => s.label === normalise(field)
  );
  return hit?.value ?? null;
}
