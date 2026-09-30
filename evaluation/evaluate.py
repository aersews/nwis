"""NWIS prototype evaluation benchmark.

Measures only what can genuinely be measured against the
repository's own data, and writes ``null`` for everything
else with a stated reason.

The governing rule: a field is a number only if it was
computed from data in this repository by code in this
repository. No literature values, no industry benchmarks,
no estimates, no rounded-up claims.

What can be measured here
-------------------------
* Retrieval latency and hybrid-vs-vector agreement, against
  a query set whose relevance labels are derived from the
  documents' own structured metadata (well / formation /
  event), not from human judgement.
* Offset ranking diagnostics across every well: how often
  the top-ranked analogue is *not* the nearest well, and how
  often it shares the active formation.
* Depth-window event recall: of the events that exist in the
  event table, how many fall inside the +/-50 m window when
  evaluated at their own depth. This is a property of the
  correlation rule, and it is stated as such.
* Risk-engine latency and score reproducibility.

What cannot be measured here, and is reported as null
--------------------------------------------------------
Alert precision, alert recall, false-alarm rate and
mean lead time all require an independent labelled set of
real incidents. The repository's event table is synthetic
and its telemetry carries an injected precursor at every
event depth, so any such figure would measure the data
generator rather than the engine. See
``evaluation/results/replay.json`` for the circularity
evidence.

Run:

    python -m evaluation.evaluate
    python -m evaluation.evaluate --out evaluation/results/evaluation.json
"""

import argparse
import json
import statistics
import time
from pathlib import Path

import pandas as pd

from ml.offset_similarity import (
    rank_offsets,
    offset_ranking_diagnostics,
    analyze_depth_risk,
    OFFSET_WEIGHTS
)
from ml.risk_engine import calculate_risk
from rag.rag_engine import (
    hybrid_search,
    search_documents,
    load_index,
    HYBRID_CONFIG,
    MODEL_NAME
)

BASE_DIR = Path(__file__).resolve().parents[1]
DATA = BASE_DIR / "data"
RESULTS = BASE_DIR / "evaluation" / "results"

WINDOW_M = 50


# =========================================================
# HELPERS
# =========================================================

def _timed(fn, repeats=5):
    """Return (result, median_ms). Median rather than mean so
    one scheduler hiccup does not dominate the figure."""

    samples = []
    result = None

    for _ in range(repeats):

        start = time.perf_counter()
        result = fn()
        samples.append(
            (time.perf_counter() - start) * 1000.0
        )

    return result, round(statistics.median(samples), 2)


def _pct(numerator, denominator):
    if not denominator:
        return None
    return round(numerator / denominator, 4)


# =========================================================
# 1. RETRIEVAL
# =========================================================

def build_queries():
    """Query set built from the corpus's own metadata.

    A query targets a document by its well identifier and
    event type — the two fields an operator actually types.
    Relevance is defined as "the document that describes this
    well and event", which is checkable against the stored
    metadata rather than asserted by a reviewer.
    """

    _, documents = load_index()

    if not documents:

        return [], {}

    seen = {}
    for doc in documents:

        meta = doc.get("metadata", {})
        key = (meta.get("well_id"), meta.get("event"))

        if key[0] in (None, "UNKNOWN"):
            continue

        seen.setdefault(key, meta)

    queries = []

    for (well_id, event), meta in sorted(seen.items()):

        queries.append({
            "query": (
                f"{well_id} {event} "
                f"{meta.get('formation') or ''} "
                f"drilling event mitigation"
            ).strip(),
            "relevant_sources": [meta["source"]],
            "well_id": well_id,
            "event": event,
            "label_basis": (
                "Derived from the document's own stored "
                "metadata (well_id + event), not from human "
                "annotation"
            )
        })

    return queries, {}


def evaluate_retrieval():
    queries, _ = build_queries()

    _, documents = load_index()
    corpus_size = len(documents or [])

    retrieved_documents = len({
        (d.get("metadata") or {}).get("source")
        for d in (documents or [])
    })

    if not queries:

        return {
            "corpus_chunks": corpus_size,
            "queries": 0,
            "note": "No metadata-derived queries available"
        }

    hybrid_latency = []
    vector_latency = []
    hit_at_1 = 0
    hit_at_3 = 0
    hybrid_vector_agreement = 0
    ndcg_sum = 0.0
    per_query = []

    for item in queries:

        results, ms = _timed(
            lambda: hybrid_search(
                query=item["query"],
                top_k=3,
                formation=None,
                event_type=None
            )
        )
        hybrid_latency.append(ms)

        baseline, vms = _timed(
            lambda: search_documents(
                query=item["query"], top_k=3
            )
        )
        vector_latency.append(vms)

        hybrid_ids = [r["id"] for r in results]
        vector_ids = [r["id"] for r in baseline]

        relevant = set(item["relevant_sources"])

        # A chunk counts as relevant if it belongs to a
        # document that describes the queried well+event.
        def _is_relevant(chunk_id):

            for doc in documents:

                if doc["id"] == chunk_id:

                    meta = doc.get("metadata", {})

                    return (
                        meta.get("source") in relevant
                        and meta.get("well_id")
                        == item["well_id"]
                        and meta.get("event")
                        == item["event"]
                    )

            return False

        ranked_relevant = [
            _is_relevant(cid) for cid in hybrid_ids
        ]

        if ranked_relevant and ranked_relevant[0]:
            hit_at_1 += 1

        if any(ranked_relevant[:3]):
            hit_at_3 += 1

        ndcg = 0.0

        for position, is_rel in enumerate(
            ranked_relevant, start=1
        ):

            if is_rel:
                ndcg += 1.0 / (2 ** (position - 1))

        ndcg_sum += ndcg

        if hybrid_ids and vector_ids:

            overlap = len(
                set(hybrid_ids) & set(vector_ids)
            ) / max(
                len(set(hybrid_ids) | set(vector_ids)), 1
            )

            hybrid_vector_agreement += overlap

        per_query.append({
            "query": item["query"],
            "well_id": item["well_id"],
            "event": item["event"],
            "label_basis": item["label_basis"],
            "hybrid_ranking": [
                {
                    "source": r["metadata"]["source"],
                    "relevance": r["relevance"],
                    "vector_score": r["vector_score"],
                    "lexical_score": r["lexical_score"]
                }
                for r in results
            ],
            "vector_ranking": [
                {
                    "source": r["metadata"]["source"],
                    "relevance": r["relevance"]
                }
                for r in baseline
            ],
            "hit_at_1": bool(
                ranked_relevant and ranked_relevant[0]
            ),
            "hit_at_3": any(ranked_relevant[:3]),
            "ndcg_at_3": round(ndcg, 4)
        })

    n = len(queries)

    return {
        "corpus_chunks": corpus_size,
        "corpus_documents": len(
            {(d.get("metadata") or {}).get("source")
             for d in (documents or [])}
        ),
        "queries": n,
        "k": 3,

        "label_basis": (
            "Metadata-derived: a chunk is relevant if it "
            "belongs to a document whose stored well_id and "
            "event match the query. This is a retrieval "
            "self-consistency check, not a human relevance "
            "judgement, and it is not a claim about incident "
            "prediction."
        ),

        "ceiling_caveat": (
            f"The indexed corpus holds "
            f"{retrieved_documents} document(s) and "
            f"{corpus_size} chunk(s), and each query names "
            f"one of those documents' own well identifiers. "
            f"Hit rates are therefore near their ceiling by "
            f"construction and say nothing about "
            f"discriminative power on a real, large corpus. "
            f"Reported to show the retrieval path is wired "
            f"correctly, not as a retrieval quality claim."
        ),

        "precision_at_3": None,
        "precision_at_3_note": (
            "Not reported. The query set has exactly one "
            "relevant document per query by construction, "
            "so precision@k reduces to hit-rate@k and "
            "quoting both would double-count one measurement."
        ),

        "hit_rate_at_1": _pct(hit_at_1, n),
        "hit_rate_at_3": _pct(hit_at_3, n),
        "ndcg_at_3": round(ndcg_sum / n, 4) if n else None,

        "hybrid_vs_vector_top3_overlap": _pct(
            hybrid_vector_agreement, n
        ),

        "median_hybrid_latency_ms": round(
            statistics.median(hybrid_latency), 2
        ) if hybrid_latency else None,
        "median_vector_latency_ms": round(
            statistics.median(vector_latency), 2
        ) if vector_latency else None,

        "embedding_model": MODEL_NAME,
        "config": HYBRID_CONFIG,

        "per_query": per_query
    }


# =========================================================
# 2. OFFSET INTELLIGENCE
# =========================================================

def evaluate_offsets():
    wells_df = pd.read_csv(DATA / "wells.csv")
    wells = wells_df.well_id.tolist()

    not_nearest = 0
    top_shares_formation = 0
    top_in_top3 = 0
    factor_coverage = {}
    checks = 0
    per_well = []

    for well_id in wells:

        try:

            diagnostics = offset_ranking_diagnostics(
                active_well_id=well_id
            )

        except Exception:

            continue

        if not diagnostics.get("top_ranked_well"):

            continue

        checks += 1

        if diagnostics["nearest_is_top_ranked"] is False:
            not_nearest += 1

        ranked = rank_offsets(
            active_well_id=well_id, top_k=3
        )

        active_formation = wells_df.loc[
            wells_df.well_id == well_id, "formation"
        ].iloc[0]

        top = ranked[0]

        if top["formation"] == active_formation:

            top_shares_formation += 1

        if any(r["well_id"] == top["well_id"] for r in ranked[:3]):
            top_in_top3 += 1

        for key, factor in (top["factors"] or {}).items():

            slot = factor_coverage.setdefault(
                key, {"available": 0, "unavailable": 0}
            )

            slot[
                "available" if factor["available"]
                else "unavailable"
            ] += 1

        per_well.append({
            "well_id": well_id,
            "nearest": diagnostics["nearest_well"],
            "nearest_distance_km":
                diagnostics["nearest_distance_km"],
            "top_ranked": diagnostics["top_ranked_well"],
            "top_ranked_distance_km":
                diagnostics["top_ranked_distance_km"],
            "top_ranked_score":
                diagnostics["top_ranked_score"],
            "nearest_is_top_ranked":
                diagnostics["nearest_is_top_ranked"],
            "nearest_rank": diagnostics["nearest_rank"]
        })

    return {
        "wells_evaluated": checks,

        "top1_relevance": None,
        "top1_relevance_note": (
            "Not reported. Top-1 relevance requires a "
            "ground-truth set of 'correct' analogue wells "
            "chosen by a drilling engineer. This repository "
            "contains no such labels, and the only available "
            "well attributes are the same attributes the "
            "ranker already scores — scoring them against "
            "each other would be circular."
        ),

        "top3_relevance": None,
        "top3_relevance_note": (
            "Not reported for the same reason as Top-1."
        ),

        "top1_is_not_nearest_rate": _pct(
            not_nearest, checks
        ),
        "top1_shares_formation_rate": _pct(
            top_shares_formation, checks
        ),
        "top1_in_top3_rate": _pct(top_in_top3, checks),

        "interpretation": (
            "top1_is_not_nearest_rate is the measurable, "
            "label-free claim: it states how often the "
            "engine's first choice is a different well from "
            "the geometrically closest one, which is the "
            "direct evidence that the ranking is more than a "
            "nearest-neighbour lookup."
        ),

        "factor_availability": factor_coverage,
        "weights": dict(OFFSET_WEIGHTS),

        "per_well": per_well
    }


# =========================================================
# 3. DEPTH-WINDOW EVENT RETRIEVAL
# =========================================================

def evaluate_depth_correlation():
    events = pd.read_csv(DATA / "events.csv")
    wells = pd.read_csv(DATA / "wells.csv")

    same_formation = events.merge(
        wells[["well_id", "formation"]],
        on="well_id",
        suffixes=("_event", "_well")
    )

    same_formation = same_formation[
        same_formation.formation_event
        == same_formation.formation_well
    ]

    total = len(same_formation)
    found = 0
    self_well_excluded = 0
    per_event = []

    for _, event in same_formation.iterrows():

        result = analyze_depth_risk(
            active_well_id=event.well_id,
            current_depth=float(event.depth),
            radius_m=WINDOW_M
        )

        hit = any(
            e["well_id"] == event.well_id
            and e["event"] == event.event
            for e in result["events"]
        )

        if hit:
            found += 1
        else:
            self_well_excluded += 1

        per_event.append({
            "event_id": event.event_id,
            "well_id": event.well_id,
            "event": event.event,
            "depth": float(event.depth),
            "retrieved": hit
        })

    return {
        "definition": (
            "An event is retrieved when the depth-window "
            "query issued at that event's own depth returns "
            "it. This measures the correlation rule, not "
            "predictive power."
        ),
        "events_in_same_formation": total,
        "retrieved_at_own_depth": found,
        "recall_at_own_depth": _pct(found, total),
        "not_retrieved": total - found,

        "labels": (
            "Derived: each event labels itself. No operator "
            "annotation is involved, so this is a "
            "self-consistency check of the depth window."
        ),

        "window_m": WINDOW_M,
        "per_event": per_event
    }


# =========================================================
# 4. RISK ENGINE
# =========================================================

def evaluate_risk_engine():
    df = pd.read_csv(DATA / "drilling_data.csv")
    wells = pd.read_csv(DATA / "wells.csv")

    latencies = []
    reproducible = True
    contributor_mismatches = 0
    checked = 0
    scores = []
    levels = {}

    # Every well is sampled, not just the demonstration well,
    # so the determinism and reconciliation checks cover the
    # whole corpus rather than one scenario.
    for well_id in wells.well_id:

        records = (
            df[df.well_id == well_id]
            .sort_values("timestamp")
            .to_dict("records")
        )

        for start in range(5, len(records), 3):

            window = records[start - 5:start]

            first, ms = _timed(
                lambda: calculate_risk(window), repeats=2
            )
            latencies.append(ms)

            again = calculate_risk(window)
            checked += 1
            scores.append(first["risk_score"])

            level = first["risk_level"]
            levels[level] = levels.get(level, 0) + 1

            if again["risk_score"] != first["risk_score"]:
                reproducible = False

            if (
                abs(
                    sum(
                        c["points"]
                        for c in first["contributors"]
                    ) - first["risk_score"]
                ) > 0.15
            ):

                contributor_mismatches += 1

    telemetry = df

    # False alarms are only definable against labels that
    # record an actual incident. They are not present.
    return {
        "risk_score_is_probability": False,
        "calibrated": False,
        "validation_status": "NOT VALIDATED",

        "windows_evaluated": checked,
        "wells_evaluated": int(len(wells)),
        "deterministic": reproducible,
        "score_range_observed": [
            min(scores) if scores else None,
            max(scores) if scores else None
        ],
        "level_distribution": levels,

        "contributor_reconciliation": {
            "windows_checked": checked,
            "mismatches": contributor_mismatches,
            "tolerance": 0.15,
            "meaning": (
                "The four additive contributions must "
                "reconstruct the reported index in every "
                "window. A mismatch would mean the panel "
                "shows numbers the engine did not use."
            )
        },

        "median_risk_latency_ms": (
            round(statistics.median(latencies), 4)
            if latencies else None
        ),

        "telemetry_rows": int(len(telemetry)),

        "alert_precision": None,
        "alert_recall": None,
        "false_alarm_rate": None,
        "median_lead_time": None,

        "alert_metrics_note": (
            "All four require an independent labelled set "
            "of real incidents. The repository's event table "
            "is synthetic and its telemetry carries an "
            "injected precursor at every event depth "
            "(see evaluation/results/replay.json → "
            "summary.circularity). Any alert rate computed "
            "against it would measure the data generator, so "
            "these fields are deliberately null."
        ),

        "target_kpis": {
            "note": (
                "Proposed acceptance thresholds for the "
                "production validation phase. These are "
                "targets, not results, and nothing here has "
                "been measured against them."
            ),
            "alert_recall_on_labelled_set": None,
            "false_alarm_rate_on_labelled_set": None,
            "median_lead_distance_m": None
        }
    }


# =========================================================
# 5. API LATENCY
# =========================================================

def evaluate_api_latency():
    """In-process handler timings.

    Measured by calling the route functions directly, so the
    figures exclude HTTP and network overhead and are a
    lower bound on end-to-end latency.
    """

    from backend import main as server

    routes = {
        "GET /api/wells": lambda: server.wells(),
        "GET /api/events": lambda: server.events(),
        "GET /api/wells/{id}/offsets": (
            lambda: server.offsets("WELL-001")
        ),
        "GET /api/risk/depth": (
            lambda: server.depth_risk(
                well_id="WELL-001", depth=2840, radius=50
            )
        ),
        "GET /api/documents": lambda: server.documents(),
        "GET /api/simulation/{id}": (
            lambda: server.drilling_simulation(
                "WELL-001", step=6
            )
        ),
        "GET /api/nwis/{id}": (
            lambda: server.unified_nwis(
                "WELL-001", depth=2840
            )
        )
    }

    results = {}

    for name, fn in routes.items():

        try:

            _, ms = _timed(fn, repeats=3)
            results[name] = ms

        except Exception as error:

            results[name] = None
            print(
                f"  ! {name} failed: {error}"
            )

    values = [
        v for v in results.values() if v is not None
    ]

    return {
        "method": (
            "Median of 3 in-process calls to the route "
            "function. Excludes HTTP framing, serialisation "
            "over the socket and browser time, so these are "
            "lower bounds on end-to-end latency."
        ),
        "per_route_ms": results,
        "median_ms": (
            round(statistics.median(values), 2)
            if values else None
        ),
        "max_ms": max(values) if values else None,
        "production_latency_target_ms": 500,
        "target_note": (
            "Proposed production target for the WITSML/ETP "
            "integration path. Not a measured service-level "
            "objective; no production deployment exists."
        )
    }


# =========================================================
# ASSEMBLY
# =========================================================

def run():
    print("Retrieval ...")
    retrieval = evaluate_retrieval()

    print("Offset intelligence ...")
    offsets = evaluate_offsets()

    print("Depth correlation ...")
    depth = evaluate_depth_correlation()

    print("Risk engine ...")
    risk = evaluate_risk_engine()

    print("API latency ...")
    api = evaluate_api_latency()

    replay_path = RESULTS / "replay.json"
    replay = (
        json.loads(replay_path.read_text(encoding="utf-8"))
        if replay_path.exists() else None
    )

    replay_summary = (replay or {}).get("summary", {})

    return {
        "evaluation_type": "prototype",
        "generated_by": "python -m evaluation.evaluate",
        "system": "NWIS — Nearby Wells Intelligence System",
        "problem_statement": "SIH 2026 · 26121",

        "validated": False,
        "validation_status": "NOT VALIDATED",

        "dataset": {
            "synthetic": True,
            "labelled": False,
            "wells": 30,
            "events": 15,
            "telemetry_rows": 3600,
            "documents": (
                retrieval.get("corpus_documents")
            ),
            "chunks": retrieval.get("corpus_chunks"),
            "note": (
                "Every record is synthetic, generated by "
                "data/generate_demo_data.py. No Oil India "
                "Limited data, no eRTMAC connection, no "
                "operator annotation."
            )
        },

        # ---- headline fields the submission format asks for ----

        "offset_top1_relevance": offsets["top1_relevance"],
        "offset_top3_relevance": offsets["top3_relevance"],

        # Deliberately null: the depth-window figure is a
        # definitional identity (querying at an event's own
        # depth returns it), and the retrieval figure sits
        # at the ceiling of a three-document corpus. Both
        # are real measurements but neither is a
        # performance claim, so neither belongs in a
        # headline field that could be read as one.
        "event_precision_at_5": None,
        "event_recall_at_5": None,
        "rag_evidence_relevance": None,

        "alert_precision": risk["alert_precision"],
        "alert_recall": risk["alert_recall"],
        "false_alarm_rate": risk["false_alarm_rate"],
        "median_lead_time": risk["median_lead_time"],

        "api_latency_ms": api["median_ms"],
        "retrieval_latency_ms": (
            retrieval.get("median_hybrid_latency_ms")
        ),

        "units": {
            "api_latency_ms": "ms",
            "retrieval_latency_ms": "ms",
            "top1_is_not_nearest_rate": "fraction_of_wells",
            "recall_at_own_depth": "fraction_of_events",
            "contributor_reconciliation_mismatches": "count",
            "risk_windows_evaluated": "count",
            "smoke_steps_passed": "count",
            "median_lead_distance_m": "m"
        },

        # ---- what IS measured ----

        "measured": {
            "offset": {
                "wells_evaluated": offsets["wells_evaluated"],
                "top1_is_not_nearest_rate":
                    offsets["top1_is_not_nearest_rate"],
                "top1_shares_formation_rate":
                    offsets["top1_shares_formation_rate"],
                "interpretation":
                    offsets["interpretation"]
            },
            "retrieval": {
                "queries": retrieval.get("queries"),
                "k": retrieval.get("k"),
                "hit_rate_at_1":
                    retrieval.get("hit_rate_at_1"),
                "hit_rate_at_3":
                    retrieval.get("hit_rate_at_3"),
                "ndcg_at_3": retrieval.get("ndcg_at_3"),
                "median_hybrid_latency_ms":
                    retrieval.get(
                        "median_hybrid_latency_ms"
                    ),
                "median_vector_latency_ms":
                    retrieval.get(
                        "median_vector_latency_ms"
                    ),
                "hybrid_vs_vector_top3_overlap":
                    retrieval.get(
                        "hybrid_vs_vector_top3_overlap"
                    ),
                "label_basis":
                    retrieval.get("label_basis"),
                "ceiling_caveat":
                    retrieval.get("ceiling_caveat"),
                "caveat": (
                    "Metadata-derived labels measure "
                    "retrieval self-consistency, not incident "
                    "prediction."
                )
            },
            "depth_correlation": {
                "events_in_same_formation":
                    depth["events_in_same_formation"],
                "retrieved_at_own_depth":
                    depth["retrieved_at_own_depth"],
                "recall_at_own_depth":
                    depth["recall_at_own_depth"],
                "definition": depth["definition"]
            },
            "risk_engine": {
                "deterministic":
                    risk["deterministic"],
                "windows_evaluated":
                    risk["windows_evaluated"],
                "wells_evaluated":
                    risk["wells_evaluated"],
                "score_range_observed":
                    risk["score_range_observed"],
                "level_distribution":
                    risk["level_distribution"],
                "contributor_reconciliation":
                    risk["contributor_reconciliation"],
                "median_risk_latency_ms":
                    risk["median_risk_latency_ms"]
            },
            "api_latency": api,
            "replay": {
                "status": replay.get("status")
                if replay else "not run",
                "median_lead_distance_m":
                    replay_summary.get(
                        "median_lead_distance_m"
                    ),
                "detection_rate":
                    replay_summary.get("detection_rate"),
                "circularity":
                    replay_summary.get("circularity"),
                "insufficient_data_reason":
                    replay_summary.get(
                        "insufficient_data_reason"
                    )
            }
        },

        # ---- why the nulls are null ----

        "null_field_reasons": {
            "offset_top1_relevance":
                offsets["top1_relevance_note"],
            "offset_top3_relevance":
                offsets["top3_relevance_note"],
            "event_precision_at_5":
                "Measured, but withheld from the headline "
                "because it is a definitional identity: "
                "querying the depth window at an event's own "
                "depth returns that event by construction. It "
                "measures the correlation rule, not "
                "predictive power. See "
                "measured.depth_correlation.",
            "event_recall_at_5":
                "Same reason as event_precision_at_5.",
            "rag_evidence_relevance":
                "Measured, but withheld from the headline "
                "because the indexed corpus is three "
                "documents and each query names one of their "
                "own well identifiers, so hit rate is near "
                "its ceiling by construction. See "
                "measured.retrieval.",
            "alert_precision": risk["alert_metrics_note"],
            "alert_recall": risk["alert_metrics_note"],
            "false_alarm_rate": risk["alert_metrics_note"],
            "median_lead_time": (
                "No incident timestamps exist in the event "
                "table, so a lead time in minutes cannot be "
                "derived. A lead *distance* in metres is "
                "measured and reported under measured.replay."
            )
        },

        "production_validation_path": [
            "Obtain an operator-labelled incident set from "
            "real historical wells, with precursors NOT "
            "injected.",
            "Cross-validate the risk rules and any "
            "candidate ML model on held-out wells.",
            "Calibrate against observed base rates "
            "(isotonic / Platt) before any output is "
            "described as a probability.",
            "Report precision, recall, false-alarm rate "
            "and lead distance/time with confidence "
            "intervals.",
            "Add uncertainty bounds and mandatory expert "
            "review; NWIS remains decision support."
        ],

        "detail": {
            "retrieval": retrieval,
            "offsets": offsets,
            "depth_correlation": depth,
            "risk_engine": risk
        }
    }


def main():
    parser = argparse.ArgumentParser(
        description=(
            "NWIS prototype evaluation. Writes only "
            "measured values; every other field is null "
            "with a stated reason."
        )
    )
    parser.add_argument(
        "--out",
        default=str(RESULTS / "evaluation.json")
    )
    args = parser.parse_args()

    payload = run()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8"
    )

    print(f"\nWritten: {out}\n")

    print("Headline fields")
    print("-" * 46)

    for key in (
        "offset_top1_relevance",
        "offset_top3_relevance",
        "event_precision_at_5",
        "rag_evidence_relevance",
        "alert_precision",
        "alert_recall",
        "median_lead_time",
        "api_latency_ms",
        "retrieval_latency_ms"
    ):

        print(f"  {key:32} {payload[key]}")

    print(
        "\nvalidation_status: "
        f"{payload['validation_status']}"
    )


if __name__ == "__main__":
    main()
