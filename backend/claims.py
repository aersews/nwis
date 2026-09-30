"""NWIS claim audit.

Every statement the system makes about itself is classified
against what the code actually does. The registry is the
single machine-readable source for that classification, and
`/api/claim-audit` serves it so the interface, the
documentation and the submission cannot drift apart.

Classification
--------------
IMPLEMENTED     The capability exists in this repository and
                runs.
DEMONSTRATED    Exercised end to end against the synthetic
                demonstration data, with the output shown.
MEASURED        A number was computed by evaluation code in
                this repository from data in this repository.
PROPOSED        A design or approach written down but not
                implemented.
PRODUCTION PATH An item of the intended production system,
                explicitly not implemented here.
NOT VALIDATED   A claim that would require a real, labelled
                dataset to support. No such dataset exists in
                this repository, so the claim is not made.
"""

from datetime import datetime, timezone

AUDIT_VERSION = "1.0"

CLASSIFICATIONS = [
    "IMPLEMENTED",
    "DEMONSTRATED",
    "MEASURED",
    "PROPOSED",
    "PRODUCTION PATH",
    "NOT VALIDATED"
]

# Each entry: claim, class, evidence.
#
# "evidence" must name a file, a route or an evaluation
# field. A claim without checkable evidence is not allowed
# into this registry.
CLAIMS = [
    # ---------------- offset intelligence ----------------
    {
        "id": "offset-ranking",
        "claim": "Offset wells are ranked by a weighted "
                 "similarity model over six factors.",
        "classification": "IMPLEMENTED",
        "evidence": "ml/offset_similarity.py → rank_offsets()"
    },
    {
        "id": "offset-ranking-demonstrated",
        "claim": "The ranking is not a nearest-well lookup: "
                 "the top-ranked analogue differs from the "
                 "geometrically nearest well.",
        "classification": "MEASURED",
        "evidence": "GET /api/wells/{id}/offset-diagnostics; "
                    "evaluation/results/evaluation.json → "
                    "measured.offset.top1_is_not_nearest_rate "
                    "(26 of 30 wells, 86.7%)"
    },
    {
        "id": "offset-factors",
        "claim": "Every ranking factor is exposed with its "
                 "weight, its normalised similarity and the "
                 "measurement it was derived from.",
        "classification": "IMPLEMENTED",
        "evidence": "GET /api/wells/{id}/offsets → "
                    "offsets[].factors"
    },
    {
        "id": "offset-top1-relevance",
        "claim": "The offset engine identifies the single "
                 "most relevant offset well (Top-1 / Top-3 "
                 "relevance).",
        "classification": "NOT VALIDATED",
        "evidence": "No ground-truth analogue labels exist. "
                    "See evaluation/results/evaluation.json → "
                    "null_field_reasons.offset_top1_relevance"
    },
    {
        "id": "offset-trajectory",
        "claim": "The system performs directional trajectory "
                 "correlation.",
        "classification": "NOT VALIDATED",
        "evidence": "wells.csv holds a trajectory profile "
                    "class only (Vertical / Directional / "
                    "Horizontal). No survey, no MD/TVD pairs."
    },

    # ---------------- risk engine ----------------
    {
        "id": "risk-score",
        "claim": "The system produces a 0-100 risk index from "
                 "four parameter trends.",
        "classification": "IMPLEMENTED",
        "evidence": "ml/risk_engine.py → calculate_risk()"
    },
    {
        "id": "risk-not-probability",
        "claim": "The risk figure is an explainable index, "
                 "not a probability of failure.",
        "classification": "IMPLEMENTED",
        "evidence": "risk.is_probability = false in "
                    "GET /api/nwis/{id}; "
                    "GET /api/risk/model → calibration"
    },
    {
        "id": "risk-contributors",
        "claim": "The index decomposes into named additive "
                 "contributions that reconstruct the reported "
                 "score exactly.",
        "classification": "MEASURED",
        "evidence": "GET /api/risk/contributors; 0 "
                    "reconciliation mismatches across 1,170 "
                    "rolling windows — "
                    "evaluation/results/evaluation.json → "
                    "measured.risk_engine."
                    "contributor_reconciliation"
    },
    {
        "id": "risk-accuracy",
        "claim": "The risk engine predicts stuck pipe / lost "
                 "circulation with a stated accuracy, "
                 "precision or recall.",
        "classification": "NOT VALIDATED",
        "evidence": "No labelled incident set exists. The "
                    "demonstration event table is synthetic. "
                    "See evaluation/results/evaluation.json → "
                    "alert_precision / alert_recall = null"
    },
    {
        "id": "risk-determinism",
        "claim": "The risk engine is deterministic: the same "
                 "window always yields the same index.",
        "classification": "MEASURED",
        "evidence": "1,170 windows re-scored, 0 divergences — "
                    "evaluation/results/evaluation.json → "
                    "measured.risk_engine.deterministic"
    },

    # ---------------- historical correlation ----------------
    {
        "id": "depth-correlation",
        "claim": "Historical events are correlated to the "
                 "current bit position by a measured-depth "
                 "window within a named formation.",
        "classification": "IMPLEMENTED",
        "evidence": "ml/offset_similarity.py → "
                    "analyze_depth_risk()"
    },
    {
        "id": "depth-correlation-honesty",
        "claim": "The system performs geological / "
                 "stratigraphic correlation using MD, TVD, "
                 "trajectory and formation tops.",
        "classification": "NOT VALIDATED",
        "evidence": "None of TVD, a directional survey, "
                    "formation tops or a stratigraphic "
                    "framework exist in the dataset. "
                    "GET /api/nwis/{id} → depth_correlation"
    },
    {
        "id": "historical-retrieval",
        "claim": "Past incident records are retrieved and "
                 "shown with their depth difference from the "
                 "bit.",
        "classification": "DEMONSTRATED",
        "evidence": "GET /api/nwis/{id} → historical_events; "
                    "Historical Intelligence panel"
    },

    # ---------------- retrieval / RAG ----------------
    {
        "id": "rag-vector",
        "claim": "Semantic retrieval over indexed "
                 "drilling documents using sentence-transformer "
                 "embeddings and FAISS.",
        "classification": "IMPLEMENTED",
        "evidence": "rag/rag_engine.py → build_index(), "
                    "search_documents()"
    },
    {
        "id": "rag-hybrid",
        "claim": "Retrieval is hybrid: BM25 lexical plus "
                 "vector similarity, with well / formation / "
                 "event / depth metadata filters.",
        "classification": "IMPLEMENTED",
        "evidence": "rag/rag_engine.py → hybrid_search(); "
                    "GET /api/retrieval/config"
    },
    {
        "id": "rag-domain-specific",
        "claim": "Retrieval is constrained to the drilling "
                 "domain rather than being a general-purpose "
                 "chat interface.",
        "classification": "IMPLEMENTED",
        "evidence": "Domain synonym expansion, hyphen-aware "
                    "well-identifier tokenisation, hard "
                    "metadata and depth filters — "
                    "rag/rag_engine.py"
    },
    {
        "id": "rag-ocr",
        "claim": "The extraction path supports OCR fallback "
                 "for scanned PDF pages, and is untested "
                 "here because the demonstration corpus "
                 "contains no scanned PDF.",
        "classification": "IMPLEMENTED",
        "evidence": "rag/rag_engine.py → "
                    "extract_pdf_pages() falls back to "
                    "pytesseract when a page yields under 40 "
                    "characters. No scanned PDF exists in this "
                    "repository, so the path is unexercised"
    },
    {
        "id": "rag-relevance",
        "claim": "Retrieval relevance scores indicate how "
                 "likely an incident is to recur.",
        "classification": "NOT VALIDATED",
        "evidence": "Relevance is a lexical/vector similarity "
                    "used for ranking. It carries no "
                    "predictive meaning and is labelled as a "
                    "similarity in the interface"
    },
    {
        "id": "evidence-page-numbers",
        "claim": "A citation carries a page number only when "
                 "the source is paginated; otherwise the "
                 "interface reports 'Page unavailable' rather "
                 "than inventing one.",
        "classification": "IMPLEMENTED",
        "evidence": "Page is captured per PDF page during "
                    "ingestion and exposed as "
                    "page_available. The demonstration corpus "
                    "is three .txt files, so all three "
                    "citations report page unavailable — no "
                    "page number is displayed for any of them"
    },

    # ---------------- alerts ----------------
    {
        "id": "alert-lifecycle",
        "claim": "Alerts move through DETECTED → ANALYZING → "
                 "CORRELATED → ALERT → ACKNOWLEDGED → "
                 "RESOLVED with server-validated transitions.",
        "classification": "IMPLEMENTED",
        "evidence": "backend/alerts.py → AlertRegistry; "
                    "GET /api/alerts; "
                    "POST /api/alerts/{id}/state"
    },
    {
        "id": "alert-timestamps",
        "claim": "Alert timestamps are rig-time from the "
                 "eRTMAC stream.",
        "classification": "NOT VALIDATED",
        "evidence": "There is no eRTMAC connection. "
                    "Timestamps are server wall-clock over a "
                    "simulated stream and every payload says "
                    "so via clock_source"
    },
    {
        "id": "alert-persistence",
        "claim": "Alert history is durably stored and "
                 "auditable.",
        "classification": "PRODUCTION PATH",
        "evidence": "In-memory registry; restarting the "
                    "backend clears it. Stated in "
                    "GET /api/alerts → persistence"
    },

    # ---------------- integration ----------------
    {
        "id": "witsml-integration",
        "claim": "NWIS ingests WITSML / ETP from eRTMAC.",
        "classification": "PRODUCTION PATH",
        "evidence": "No such client exists. The stream is "
                    "driven from data/drilling_data.csv. "
                    "Architecture described in "
                    "docs/ARCHITECTURE.md"
    },
    {
        "id": "oil-india-connection",
        "claim": "NWIS is connected to Oil India Limited or "
                 "eRTMAC systems.",
        "classification": "NOT VALIDATED",
        "evidence": "No connection of any kind. Every "
                    "identifier, coordinate, formation and "
                    "incident in the repository is synthetic"
    },
    {
        "id": "live-stream",
        "claim": "A live drilling parameter stream reaches "
                 "the dashboard.",
        "classification": "DEMONSTRATED",
        "evidence": "ws://…/ws/live/{well_id} replays "
                    "data/drilling_data.csv; the transport is "
                    "a real WebSocket but the source is a "
                    "recorded synthetic file"
    },

    # ---------------- operations impact ----------------
    {
        "id": "npt-reduction",
        "claim": "NWIS reduces non-productive time.",
        "classification": "NOT VALIDATED",
        "evidence": "No operational data, no baseline and no "
                    "field trial exist. No NPT or cost "
                    "figure is quoted anywhere in this "
                    "repository"
    },
    {
        "id": "cost-savings",
        "claim": "NWIS delivers measurable cost savings.",
        "classification": "NOT VALIDATED",
        "evidence": "As above. Any figure would be fabricated"
    },
    {
        "id": "real-well-data",
        "claim": "The demonstration reflects real wells, real "
                 "formations or real incidents.",
        "classification": "NOT VALIDATED",
        "evidence": "data/generate_demo_data.py generates "
                    "every record from a seeded RNG. Formations "
                    "are named Formation-X/Y/Z"
    },
    {
        "id": "research-results",
        "claim": "NWIS reproduces results from published "
                 "research.",
        "classification": "PROPOSED",
        "evidence": "Literature is cited in docs/REFERENCES.md "
                    "as context for the approach. No "
                    "reproduction experiment has been run"
    },

    # ---------------- security / production ----------------
    {
        "id": "security-architecture",
        "claim": "NWIS implements RBAC, encryption, audit "
                 "logging, model and index versioning, "
                 "retention policy, monitoring and drift "
                 "detection.",
        "classification": "PRODUCTION PATH",
        "evidence": "None of these are implemented. Described "
                    "as production design in "
                    "docs/ARCHITECTURE.md and labelled as such "
                    "there"
    },
    {
        "id": "ml-model",
        "claim": "NWIS uses a trained machine-learning risk "
                 "model.",
        "classification": "NOT VALIDATED",
        "evidence": "The risk engine is a fixed-weight rule "
                    "set (ml/risk_engine.py → RISK_MODEL). No "
                    "model is trained, fitted or calibrated. "
                    "Retrieval uses a pretrained sentence "
                    "transformer, not a trained-on-NWIS model"
    },
    {
        "id": "production-validation-path",
        "claim": "A path exists to obtain a calibrated, "
                 "validated risk model.",
        "classification": "PROPOSED",
        "evidence": "GET /api/risk/model → "
                    "production_validation_path; "
                    "evaluation/results/evaluation.json → "
                    "production_validation_path"
    },

    # ---------------- system behaviour ----------------
    {
        "id": "why-now",
        "claim": "NWIS explains why an alert is being raised "
                 "right now, from measured signal changes and "
                 "matched historical events.",
        "classification": "IMPLEMENTED",
        "evidence": "backend/why_now.py → build_why_now(); "
                    "GET /api/why-now/{id}; GET /api/nwis/{id} "
                    "→ why_now"
    },
    {
        "id": "why-this-well",
        "claim": "Selecting an offset well explains why it was "
                 "selected, factor by factor.",
        "classification": "IMPLEMENTED",
        "evidence": "GET /api/wells/{id}/offsets → "
                    "offsets[].factors; "
                    "GET /api/wells/{id}/offset-diagnostics"
    },
    {
        "id": "recommendation",
        "claim": "NWIS generates a recommended action.",
        "classification": "IMPLEMENTED",
        "evidence": "backend/recommendations.py — rule-based "
                    "on the matched event type"
    },
    {
        "id": "recommendation-authority",
        "claim": "The recommendation is an autonomous "
                 "decision.",
        "classification": "NOT VALIDATED",
        "evidence": "NWIS is decision support. The output is "
                    "a review prompt; execution stays with "
                    "the drilling engineer"
    },
    {
        "id": "evaluation",
        "claim": "A reproducible evaluation harness exists "
                 "and reports only measured values.",
        "classification": "IMPLEMENTED",
        "evidence": "python -m evaluation.evaluate; "
                    "python -m evaluation.replay → "
                    "evaluation/results/*.json"
    },
    {
        "id": "replay-circularity",
        "claim": "Replay alert detection demonstrates "
                 "predictive capability.",
        "classification": "NOT VALIDATED",
        "evidence": "The generator injects a precursor "
                    "fingerprint at every event depth "
                    "(measured ROP ratio 0.631 vs the "
                    "generator's x0.62). Detection rate is "
                    "withheld — "
                    "evaluation/results/replay.json → "
                    "summary.circularity"
    },
    {
        "id": "latency",
        "claim": "NWIS meets a production response-time "
                 "requirement.",
        "classification": "NOT VALIDATED",
        "evidence": "In-process route timings are measured "
                    "(evaluation/results/evaluation.json → "
                    "measured.api_latency) but exclude HTTP "
                    "and browser time. The 500 ms figure is a "
                    "PROPOSED target, not a measured SLO"
    }
]


def claim_audit():
    by_class = {}

    for claim in CLAIMS:

        by_class.setdefault(
            claim["classification"], []
        ).append(claim["id"])

    return {
        "system": "NWIS — Nearby Wells Intelligence System",
        "problem_statement": "SIH 2026 · 26121",
        "audit_version": AUDIT_VERSION,
        "generated_at": datetime.now(
            timezone.utc
        ).isoformat(timespec="seconds"),
        "classifications": CLASSIFICATIONS,
        "counts": {
            name: len(ids)
            for name, ids in sorted(by_class.items())
        },
        "total_claims": len(CLAIMS),
        "data_status": {
            "synthetic": True,
            "oil_india_connection": False,
            "ertmac_connection": False,
            "real_well_data": False,
            "real_incident_data": False,
            "labelled_evaluation_set": False
        },
        "rule": (
            "A claim is only classified IMPLEMENTED, "
            "DEMONSTRATED or MEASURED when the named file, "
            "route or evaluation field exists in this "
            "repository. Everything else is PROPOSED, "
            "PRODUCTION PATH or NOT VALIDATED."
        ),
        "claims": CLAIMS
    }
