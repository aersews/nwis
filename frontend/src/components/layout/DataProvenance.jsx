import { Modal } from "../common/Modal.jsx";
import { api } from "../../lib/api.js";
import { num, label as fmtLabel } from "../../lib/format.js";
import { IconInfo, IconShieldAlert } from "../common/Icons.jsx";

/* Every row is traceable: which panel, which endpoint, and
   whether the value is measured or synthetic. */
const SOURCES = [
  {
    panel: "Risk index, why-this-alert, historical context, evidence, recommendation",
    endpoint: "GET /api/nwis/{well_id}?depth=",
    nature: "Derived",
    color: "var(--info)",
    note: "Offset ranking, depth correlation, FAISS retrieval and the recommendation engine, all in one response."
  },
  {
    panel: "Live signal index, depth progression, precursor flags, demo transport",
    endpoint: "GET /api/simulation/{well_id}?step=",
    nature: "Synthetic",
    color: "var(--warn)",
    note: "A scripted worsening sequence. Not a real well and not an eRTMAC feed."
  },
  {
    panel: "Live telemetry charts (replay source)",
    endpoint: "ws://…/ws/live/{well_id}",
    nature: "Synthetic",
    color: "var(--warn)",
    note: "Rolling replay of the indexed drilling record, scored per frame by the same risk engine."
  },
  {
    panel: "Document intelligence inventory, source viewer",
    endpoint: "GET /api/documents · GET /api/documents/detail",
    nature: "Measured",
    color: "var(--ok)",
    note: "Counts are read from the live FAISS index and chunk store."
  },
  {
    panel: "Semantic evidence, global search",
    endpoint: "GET /api/rag/search?q=",
    nature: "Measured",
    color: "var(--ok)",
    note: "FAISS inner-product search over sentence-transformer embeddings."
  },
  {
    panel: "Offset-well explorer, well drawer, comparison",
    endpoint: "GET /api/wells/{well_id}/offsets · GET /api/wells",
    nature: "Derived",
    color: "var(--info)",
    note: "Similarity weighting: formation 0.25, geographic 0.20, depth 0.15, trajectory 0.15, hole section 0.15, event density 0.10."
  },
  {
    panel: "Structured event cross-checks, event search",
    endpoint: "GET /api/events · GET /api/evidence/{well_id}",
    nature: "Synthetic",
    color: "var(--warn)",
    note: "Hand-generated incident rows used for depth correlation."
  },
  {
    panel: "System indicator, health",
    endpoint: "GET /api/status (falls back to GET /)",
    nature: "Measured",
    color: "var(--ok)",
    note: "Backend liveness only."
  }
];

const NATURE_COLOR = {
  Measured: "var(--ok)",
  Derived: "var(--info)",
  Synthetic: "var(--warn)"
};

export function DataProvenance({ open, onClose, documents, systemState }) {
  const totals = documents?.totals;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      eyebrow="Data provenance"
      severity="medium"
      title="Where every number on this screen comes from"
      actions={
        <>
          <span className="label" style={{ letterSpacing: "0.1em" }}>
            NWIS is a prototype. It is not connected to Oil India Limited
            eRTMAC and contains no confidential operational data.
          </span>
        </>
      }
    >
      <div className="banner banner--warn">
        <IconShieldAlert size={15} className="banner__icon" />
        <div className="banner__body">
          <span className="banner__title">
            Demonstration data — synthetic wells, synthetic incidents
          </span>
          <span className="banner__text">
            Well identifiers (<span className="mono">WELL-001</span>,{" "}
            <span className="mono">WELL-017</span>,{" "}
            <span className="mono">WELL-029</span>), coordinates, formations
            and incident records in this build are generated for
            demonstration. They do not correspond to real wells, real
            operators or real events. Anything labelled{" "}
            <strong>SIMULATED</strong> or <strong>DEMO DATA</strong> in the
            interface is scripted, not measured.
          </span>
        </div>
      </div>

      <div className="prov-table">
        <div className="prov-row prov-row--head">
          <span>Panel</span>
          <span>Backend route</span>
          <span>Nature</span>
        </div>
        {SOURCES.map((row) => (
          <div className="prov-row" key={row.endpoint}>
            <span>
              <span className="prov-row__panel">{row.panel}</span>
              {row.note ? (
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--fs-xs)",
                    color: "var(--text-faint)",
                    marginTop: 3,
                    lineHeight: 1.5
                  }}
                >
                  {row.note}
                </span>
              ) : null}
            </span>
            <span className="prov-row__endpoint">{row.endpoint}</span>
            <span
              className="prov-row__nature"
              style={{
                "--nature-color": NATURE_COLOR[row.nature] ?? row.color
              }}
            >
              {row.nature}
            </span>
          </div>
        ))}
      </div>

      <div className="kv">
        <div className="kv__cell">
          <span className="kv__label">Backend</span>
          <span className="kv__value" style={{ fontSize: "var(--fs-xs)" }}>
            {api.API_BASE || "same origin (dev proxy)"}
          </span>
        </div>
        <div className="kv__cell">
          <span className="kv__label">System status</span>
          <span className="kv__value" style={{ fontSize: "var(--fs-xs)" }}>
            {systemState?.reachable
              ? fmtLabel(systemState.status)
              : "unreachable"}
          </span>
        </div>
        <div className="kv__cell">
          <span className="kv__label">System note</span>
          <span className="kv__value" style={{ fontSize: "var(--fs-xs)" }}>
            {fmtLabel(systemState?.note, "—")}
          </span>
        </div>
        <div className="kv__cell">
          <span className="kv__label">Index size</span>
          <span className="kv__value" style={{ fontSize: "var(--fs-xs)" }}>
            {totals
              ? `${num(totals.documents, 0)} docs · ${num(
                  totals.chunks,
                  0
                )} chunks · ${num(documents?.index?.dimension, 0)}d`
              : "—"}
          </span>
        </div>
      </div>

      <p className="note">
        <IconInfo size={13} className="note__icon" />
        <span>
          The interface never substitutes a plausible number for a missing
          one. Where a field is absent from the API it is rendered as{" "}
          <strong>“Not available”</strong>, and where a capability does not
          exist in the dataset — directional surveys, formation boundaries,
          historical time series for offset wells — the panel says so instead
          of drawing an approximation.
        </span>
      </p>
    </Modal>
  );
}

export default DataProvenance;
