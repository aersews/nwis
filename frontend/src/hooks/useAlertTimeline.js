import { useCallback, useEffect, useRef, useState } from "react";

import { severityKey } from "../lib/risk.js";
import { timeOfDay } from "../lib/format.js";

/* =========================================================
   ALERT TIMELINE
   Entries are *derived* from what the backend actually
   returned — a level transition, a newly crossed precursor
   threshold, a historical match, retrieved evidence. Nothing
   is invented; if the backend did not say it, it is not here.
   ========================================================= */

const MAX_ENTRIES = 60;

let counter = 0;
const nextId = () => {
  counter += 1;
  return `al-${counter}`;
};

export function useAlertTimeline() {
  const [entries, setEntries] = useState([]);
  const seenRef = useRef(new Map());

  const push = useCallback((entry) => {
    setEntries((prev) => {
      const next = [
        ...prev,
        {
          id: nextId(),
          at: Date.now(),
          clock: timeOfDay(),
          severity: "info",
          ...entry
        }
      ];
      return next.slice(-MAX_ENTRIES);
    });
  }, []);

  /** Adds an entry only the first time `dedupeKey` is seen. */
  const pushOnce = useCallback(
    (dedupeKey, entry) => {
      if (!dedupeKey) return false;
      if (seenRef.current.has(dedupeKey)) return false;
      seenRef.current.set(dedupeKey, true);
      push(entry);
      return true;
    },
    [push]
  );

  /** Records each new warning string the backend raises. */
  const recordWarnings = useCallback(
    (warnings = []) => {
      warnings.forEach((warning) => {
        pushOnce(`warn:${warning}`, {
          kind: "signal",
          severity: "medium",
          title: warning,
          detail: "Rolling-window threshold crossed"
        });
      });
    },
    [pushOnce]
  );

  const recordLevel = useCallback(
    (level, score) => {
      if (!level) return;
      const key = severityKey(level);
      const seen = seenRef.current;
      if (seen.has("level")) {
        if (seen.get("level") === key) return;
      }
      seen.set("level", key);

      push({
        kind: "level",
        severity: key,
        title:
          key === "critical"
            ? "CRITICAL — intervention review required"
            : key === "high"
              ? "HIGH RISK — supervisor escalation advised"
              : key === "medium"
                ? "MEDIUM RISK — enhanced monitoring"
                : "LOW RISK — parameters within envelope",
        detail: `Live signal index ${score} / 100`,
        score
      });
    },
    [push]
  );

  const clear = useCallback(() => {
    setEntries([]);
    seenRef.current = new Map();
  }, []);

  useEffect(() => clear, [clear]);

  return { entries, push, pushOnce, recordWarnings, recordLevel, clear };
}
