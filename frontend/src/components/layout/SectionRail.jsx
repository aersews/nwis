import { memo } from "react";

const GROUPS = [
  {
    label: "Command",
    items: [
      { id: "sec-map", index: "01", label: "Geospatial" },
      { id: "sec-risk", index: "02", label: "Risk" },
      { id: "sec-whynow", index: "03", label: "Why now" },
      { id: "sec-why", index: "04", label: "Rationale" }
    ]
  },
  {
    label: "Streaming",
    items: [
      { id: "sec-telemetry", index: "05", label: "Telemetry" },
      { id: "sec-lifecycle", index: "06", label: "Lifecycle" },
      { id: "sec-timeline", index: "12", label: "Alerts" }
    ]
  },
  {
    label: "Memory",
    items: [
      { id: "sec-history", index: "07", label: "Depth context" },
      { id: "sec-evidence", index: "08", label: "Evidence" },
      { id: "sec-reco", index: "09", label: "Decision" },
      { id: "sec-documents", index: "10", label: "Documents" },
      { id: "sec-offsets", index: "11", label: "Offsets" }
    ]
  },
  {
    label: "Assurance",
    items: [
      { id: "sec-evaluation", index: "13", label: "Evaluation" }
    ]
  }
];

/**
 * Section rail. The numbering is the reading order an operator
 * is taught: state → risk → why → history → evidence → action.
 */
export const SectionRail = memo(function SectionRail({
  active,
  onNavigate,
  severityBySection = {}
}) {
  return (
    <nav className="rail" aria-label="Dashboard sections">
      {GROUPS.map((group) => (
        <div className="rail__group" key={group.label}>
          <span className="label rail__label">{group.label}</span>
          {group.items.map((item) => {
            const severity = severityBySection[item.id];
            return (
              <button
                type="button"
                key={item.id}
                className="rail__link"
                aria-current={active === item.id}
                onClick={() => onNavigate(item.id)}
                data-sev={severity ?? "none"}
              >
                <span className="rail__link-index">{item.index}</span>
                {item.label}
                {severity && severity !== "none" ? (
                  <i className="rail__sev" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      ))}

      <div className="rail__foot">
        <span className="rail__foot-row">
          <span>Mode</span>
          <span>DEMO</span>
        </span>
        <span className="rail__foot-row">
          <span>Data</span>
          <span>Synthetic</span>
        </span>
        <span className="rail__foot-row">
          <span>eRTMAC</span>
          <span>Not connected</span>
        </span>
      </div>
    </nav>
  );
});

export default SectionRail;
