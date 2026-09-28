import { memo } from "react";

import { EmptyState } from "../common/States.jsx";
import { severityKey } from "../../lib/risk.js";
import { num } from "../../lib/format.js";
import {
  IconActivity,
  IconAlert,
  IconCheck,
  IconHistory,
  IconInfo,
  IconRadar
} from "../common/Icons.jsx";

const KIND_GLYPH = {
  level: IconAlert,
  signal: IconActivity,
  evidence: IconInfo,
  correlation: IconHistory,
  system: IconRadar
};

function AlertTimelineBase({ entries, onSelect, activeId }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        severity="info"
        icon={<IconRadar size={16} />}
        title="No alerts yet"
        message="Start the demonstration sequence. NWIS records a line here whenever the backend changes a risk level, crosses a precursor threshold, or retrieves historical evidence."
      />
    );
  }

  const ordered = [...entries].reverse();

  return (
    <div className="timeline">
      {ordered.map((entry, index) => {
        const severity = severityKey(entry.severity);
        const Glyph = KIND_GLYPH[entry.kind] ?? IconInfo;
        const latest = index === 0;

        return (
          <button
            type="button"
            className="tl"
            key={entry.id}
            data-sev={severity}
            data-latest={latest}
            onClick={() => onSelect?.(entry)}
            aria-current={activeId === entry.id ? "true" : undefined}
            style={
              activeId === entry.id
                ? { background: "#4d9dff12", boxShadow: "inset 2px 0 0 var(--info)" }
                : undefined
            }
          >
            <span className="tl__time">{entry.clock}</span>
            <span className="tl__rail" aria-hidden="true">
              <span className="tl__led" />
            </span>
            <span className="tl__body">
              <span className="tl__title">{entry.title}</span>
              {entry.detail ? (
                <span className="tl__detail">{entry.detail}</span>
              ) : null}
            </span>
            <span className="tl__sev">
              <Glyph
                size={11}
                style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }}
              />
              {entry.score !== undefined && entry.score !== null
                ? num(entry.score, 0)
                : (entry.severity ?? "").toUpperCase()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const AlertTimeline = memo(AlertTimelineBase);

export { IconCheck };
export default AlertTimeline;
