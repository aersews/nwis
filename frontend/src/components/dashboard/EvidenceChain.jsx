import { memo } from "react";

/**
 * The evidence chain is the product thesis in one strip:
 * every conclusion is reachable back to a raw observation.
 */
function EvidenceChainBase({ contextual, liveFrame, onNavigate, documents }) {
  const documentsRetrieved = contextual?.document_evidence?.length ?? 0;
  const offsets = contextual?.offsets?.length ?? 0;
  const events = contextual?.historical_event_count ?? 0;
  const hasEvidence = documentsRetrieved > 0;

  const nodes = [
    {
      id: "sec-telemetry",
      index: "01",
      name: "Live data",
      value: liveFrame
        ? `${num(liveFrame.depth, 0)} m · 4 parameters`
        : "stream idle",
      color: "var(--info)",
      active: Boolean(liveFrame)
    },
    {
      id: "sec-risk",
      index: "02",
      name: "Risk engine",
      value: contextual
        ? `${num(contextual.risk?.score, 1)} / 100`
        : "—",
      color: "var(--warn)",
      active: Boolean(contextual)
    },
    {
      id: "sec-offsets",
      index: "03",
      name: "Offset wells",
      value: offsets > 0 ? `${offsets} ranked` : "not ranked",
      color: "var(--info)",
      active: offsets > 0
    },
    {
      id: "sec-history",
      index: "04",
      name: "Depth context",
      value: events > 0 ? `${events} event${events === 1 ? "" : "s"}` : "none in window",
      color: events > 0 ? "var(--crit)" : "var(--text-faint)",
      active: events > 0
    },
    {
      id: "sec-evidence",
      index: "05",
      name: "Documents",
      value: documentsRetrieved > 0
        ? `${documentsRetrieved} retrieved`
        : documents
          ? `${documents.totals?.chunks ?? 0} chunks indexed`
          : "—",
      color: hasEvidence ? "var(--info)" : "var(--text-faint)",
      active: hasEvidence
    },
    {
      id: "sec-reco",
      index: "06",
      name: "Recommendation",
      value: contextual?.recommendation?.confidence
        ? `${fmtConfidence(contextual.recommendation.confidence)} confidence`
        : "pending",
      color: contextual?.recommendation ? "var(--ok)" : "var(--text-faint)",
      active: Boolean(contextual?.recommendation)
    }
  ];

  return (
    <div className="chain" role="list" aria-label="Evidence chain">
      {nodes.map((node) => (
        <button
          type="button"
          className="chain__node"
          key={node.id}
          role="listitem"
          data-active={node.active}
          style={{ "--node-color": node.color }}
          onClick={() => onNavigate(node.id)}
          title={`Go to ${node.name}`}
        >
          <span className="chain__node-index">{node.index}</span>
          <span className="chain__node-name">{node.name}</span>
          <span className="chain__node-value">{node.value}</span>
        </button>
      ))}
    </div>
  );
}

function num(value, digits) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "—";
}

function fmtConfidence(value) {
  return String(value ?? "").toUpperCase();
}

export const EvidenceChain = memo(EvidenceChainBase);
export default EvidenceChain;
