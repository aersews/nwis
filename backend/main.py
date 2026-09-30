from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from datetime import datetime, timezone
import pandas as pd, asyncio, json

from ml.offset_similarity import (
    rank_offsets,
    analyze_depth_risk,
    offset_ranking_diagnostics,
    find_well,
    OFFSET_WEIGHTS
)
from ml.risk_engine import (
    risk_score,
    simulate_live,
    calculate_risk,
    build_contributors,
    contextual_level,
    RISK_MODEL
)
from rag.rag_engine import (
    build_index,
    search_documents,
    hybrid_search,
    load_index,
    MODEL_NAME,
    DOCS_DIR,
    HYBRID_CONFIG
)
from backend.recommendations import (
    generate_recommendation
)
from backend.why_now import (
    build_why_now
)
from backend.alerts import (
    REGISTRY as ALERT_REGISTRY
)
from backend.claims import (
    claim_audit
)

app=FastAPI(title="NWIS — Nearby Wells Intelligence System", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DATA=Path(__file__).resolve().parents[1]/"data"

# =====================================================
# DEMONSTRATION PRECURSOR RECORD
#
# The scripted scenario in /api/simulation uses a
# deterministic degradation curve. The same five-frame
# record is what /api/nwis scores when no live frame has
# been supplied, so the two surfaces cannot disagree.
# Always presented as demonstration data.
# =====================================================

DEMO_RECORDS = [
    {"rop": 24, "torque": 15, "ecd": 1.18, "pit_volume": 100},
    {"rop": 22, "torque": 17, "ecd": 1.19, "pit_volume": 99},
    {"rop": 19, "torque": 19, "ecd": 1.21, "pit_volume": 98},
    {"rop": 16, "torque": 22, "ecd": 1.24, "pit_volume": 96},
    {"rop": 12, "torque": 27, "ecd": 1.28, "pit_volume": 94}
]

DEMO_SIGNAL_SOURCE = (
    "Backend demonstration precursor record "
    "(deterministic 5-frame degradation curve)"
)


def demo_risk_result():
    return calculate_risk(DEMO_RECORDS)


def require_well(well_id):
    """Reject an unknown well with 404 rather than letting a
    pandas lookup fail as an unhandled 500.

    The well identifier reaches these routes from the
    interface and from operator input, so an unknown value is a
    normal request, not a server fault.
    """

    if find_well(well_id) is None:

        raise HTTPException(
            status_code=404,
            detail=(
                f"Unknown well '{well_id}'. It is not present "
                f"in data/wells.csv."
            )
        )

    return True


def baseline_signals(records):
    """First frame of the engine's rolling window."""
    return records[0] if records else None


def current_signals(records):
    """Last frame of the engine's rolling window."""
    return records[-1] if records else None


def attach_coordinates(well_id, offsets):
    """Add lat/lon to the active well and its ranked offsets."""
    wells_df=pd.read_csv(DATA/"wells.csv")

    active_well_data=None

    match=wells_df[wells_df.well_id==well_id]

    if not match.empty:

        row=match.iloc[0]

        active_well_data={
            "well_id":well_id,
            "latitude":float(row.latitude),
            "longitude":float(row.longitude)
        }

    coords={
        row.well_id:(float(row.latitude),float(row.longitude))
        for _,row in wells_df.iterrows()
    }

    for offset in offsets:

        position=coords.get(offset["well_id"])

        if position is None:
            continue

        offset["latitude"],offset["longitude"]=position

    return active_well_data,offsets

@app.get("/")
def root():
    return {"system":"NWIS","mode":"DEMO","status":"online","note":"Synthetic demonstration data; no OIL/eRTMAC connection."}

@app.get("/api/status")
def status():
    """
    Same payload as the root route, exposed under /api so a
    development server can proxy the API without colliding
    with its own index document. Additive alias only.
    """
    return {
        "system": "NWIS",
        "mode": "DEMO",
        "status": "online",
        "version": app.version,
        "note": (
            "Synthetic demonstration data; "
            "no OIL/eRTMAC connection."
        )
    }

@app.get("/api/wells")
def wells():
    return pd.read_csv(DATA/"wells.csv").to_dict("records")

@app.get("/api/wells/{well_id}/offsets")
def offsets(well_id:str):
    require_well(well_id)
    return rank_offsets(well_id)

@app.get("/api/events")
def events():
    return pd.read_csv(DATA/"events.csv").to_dict("records")

@app.get("/api/risk/depth")
def depth_risk(
    well_id: str = "WELL-001",
    depth: float = 2840,
    radius: float = 50
):
    require_well(well_id)
    return analyze_depth_risk(
        active_well_id=well_id,
        current_depth=depth,
        radius_m=radius
    )

@app.get("/api/evidence/{well_id}")
def evidence(well_id:str):
    # An unknown well has no events; that is an empty result,
    # not a fault, so this returns [] rather than 404.
    e=pd.read_csv(DATA/"events.csv")
    return e[e.well_id==well_id].to_dict("records")

@app.get("/api/evidence")
def evidence(
    formation: str,
    depth: float,
    event: str = ""
):

    query = (
        f"historical drilling "
        f"{formation} "
        f"depth {depth} "
        f"{event} "
        f"incident mitigation lesson learned"
    )

    results = hybrid_search(
        query=query,
        top_k=5,
        formation=formation or None,
        event_type=event or None,
        reference_depth=depth,
        depth_window_m=50
    )

    return {
        "formation": formation,
        "depth": depth,
        "event": event,
        "results": results,
        "retrieval": {
            "mode": "hybrid",
            "config": HYBRID_CONFIG
        }
    }

@app.get("/api/intelligence/{well_id}/evidence")
def intelligence_evidence(
    well_id: str,
    depth: float = 2840
):

    formation = "Formation-Y"

    query = (
        f"historical drilling event "
        f"{formation} "
        f"around {depth} meters "
        f"risk mitigation "
        f"offset well"
    )

    results = hybrid_search(
        query=query,
        top_k=5,
        formation=formation,
        reference_depth=depth,
        depth_window_m=50
    )

    return {

        "active_well":
            well_id,

        "formation":
            formation,

        "current_depth":
            depth,

        "evidence":
            results
    }

@app.get("/api/intelligence/{well_id}/recommendation")
def intelligence_recommendation(
    well_id: str,
    depth: float = 2840
):

    formation = "Formation-Y"

    query = (
        f"historical drilling "
        f"{formation} "
        f"around {depth} meters "
        f"risk mitigation"
    )

    evidence = hybrid_search(
        query=query,
        top_k=5,
        formation=formation,
        reference_depth=depth,
        depth_window_m=50
    )

    recommendation = generate_recommendation(
        risk_event="stuck pipe",
        evidence=evidence
    )

    return {

        "well_id": well_id,

        "depth": depth,

        "formation": formation,

        "evidence": evidence,

        "recommendation":
            recommendation

    }

@app.get("/api/demo/risk")
def demo_risk():

    demo_records = [

        {
            "rop": 24,
            "torque": 15,
            "ecd": 1.18,
            "pit_volume": 100
        },

        {
            "rop": 22,
            "torque": 17,
            "ecd": 1.19,
            "pit_volume": 99
        },

        {
            "rop": 19,
            "torque": 19,
            "ecd": 1.21,
            "pit_volume": 98
        },

        {
            "rop": 16,
            "torque": 22,
            "ecd": 1.24,
            "pit_volume": 96
        },

        {
            "rop": 12,
            "torque": 27,
            "ecd": 1.28,
            "pit_volume": 94
        }

    ]

    return calculate_risk(
        demo_records
    )

@app.get("/api/intelligence/{well_id}")
def intelligence(
    well_id: str,
    depth: float = 2840
):

    require_well(well_id)

    # ----------------------------------------
    # 1. OFFSET WELL INTELLIGENCE
    # ----------------------------------------

    offsets = rank_offsets(
        active_well_id=well_id,
        top_k=7
    )

    # ----------------------------------------
    # 2. FORMATION + DEPTH INTELLIGENCE
    # ----------------------------------------

    depth_analysis = analyze_depth_risk(
        active_well_id=well_id,
        current_depth=depth,
        radius_m=50
    )

    # ----------------------------------------
    # 3. HISTORICAL EVENT SUMMARY
    # ----------------------------------------

    historical_events = (
        depth_analysis["events"]
    )

    # ----------------------------------------
    # 4. DEMO CURRENT DRILLING SIGNAL
    #
    # Later this comes directly from
    # the eRTMAC stream.
    # ----------------------------------------

    current_records = [

        {
            "rop": 24,
            "torque": 15,
            "ecd": 1.18,
            "pit_volume": 100
        },

        {
            "rop": 22,
            "torque": 17,
            "ecd": 1.19,
            "pit_volume": 99
        },

        {
            "rop": 19,
            "torque": 19,
            "ecd": 1.21,
            "pit_volume": 98
        },

        {
            "rop": 16,
            "torque": 22,
            "ecd": 1.24,
            "pit_volume": 96
        },

        {
            "rop": 12,
            "torque": 27,
            "ecd": 1.28,
            "pit_volume": 94
        }

    ]

    risk = calculate_risk(
        current_records
    )

    # ----------------------------------------
    # 5. HISTORICAL SUPPORT
    # ----------------------------------------

    matching_event_count = (
        depth_analysis[
            "matching_events"
        ]
    )

    # ----------------------------------------
    # 6. CONFIDENCE BOOST
    #
    # Historical evidence strengthens
    # the current precursor signal.
    # ----------------------------------------

    evidence_bonus = min(
        matching * 3,
        15
    )

    contextual = min(
        risk["risk_score"]
        + evidence_bonus,
        100
    )

    # The contextual index is what the panel headlines, so
    # the contribution breakdown must include the
    # historical bonus or the bars would not add up to it.
    contributors, contributors_total, reconciles = (
        build_contributors(risk, evidence_bonus)
    )

    final_level = contextual_level(contextual)

    # ----------------------------------------
    # 8. EXPLANATION
    # ----------------------------------------

    if matching_event_count > 0:

        explanation = (
            f"{matching_event_count} historical "
            f"drilling event(s) were found within "
            f"±{depth_analysis['search_window_m']} m "
            f"of the current depth in the same "
            f"formation."
        )

    else:

        explanation = (
            "No historical event was found within "
            "the configured depth window."
        )

    DATA = Path(__file__).resolve().parents[1] / "data"

    wells_df = pd.read_csv(
        DATA / "wells.csv"
    )

    active_well_row = wells_df[
        wells_df.well_id == well_id
    ].iloc[0]

    active_well_data = {
        "well_id": well_id,
        "latitude": float(
            active_well_row.latitude
        ),
        "longitude": float(
            active_well_row.longitude
        )
    }

    for offset in offsets:

        row = wells_df[
            wells_df.well_id == offset["well_id"]
        ].iloc[0]

        offset["latitude"] = float(
            row.latitude
        )

        offset["longitude"] = float(
            row.longitude
        )

    return {

        "active_well": well_id,

        "active_well_data": active_well_data,

        "current_depth": depth,

        "formation":
            depth_analysis["formation"],


        "risk": {

            "score":
                round(
                    contextual_risk,
                    1
                ),

            "level":
                final_level,

            "predicted_event":
                risk["event"],

            "precursor_signals":
                risk["signals"],

            "reasons":
                risk["reasons"]

        },

        "offset_wells":
            offsets,

        "historical_evidence":
            historical_events,

        "historical_event_count":
            matching_event_count,

        "explanation":
            explanation,

        "system_mode":
            "DEMONSTRATION"

    }

@app.get("/api/simulation/{well_id}")
def drilling_simulation(
    well_id: str,
    step: int = 0
):

    require_well(well_id)

    base_depth = 2800

    depth = min(
        base_depth + step * 10,
        2900
    )

    # Gradually worsening drilling behaviour
    progress = min(step / 8, 1.0)

    rop = round(
        28 - progress * 17,
        2
    )

    torque = round(
        12 + progress * 18,
        2
    )

    ecd = round(
        1.14 + progress * 0.16,
        3
    )

    pit_volume = round(
        102 - progress * 9,
        2
    )

    signals = {
        "rop": rop,
        "torque": torque,
        "ecd": ecd,
        "pit_volume": pit_volume
    }

    warnings = []

    if rop < 18:
        warnings.append(
            "ROP decreasing significantly"
        )

    if torque > 20:
        warnings.append(
            "Torque increasing"
        )

    if ecd > 1.22:
        warnings.append(
            "ECD increasing"
        )

    if pit_volume < 97:
        warnings.append(
            "Pit-volume decrease detected"
        )

    risk_score = min(
        20
        + len(warnings) * 18
        + max(step - 4, 0) * 3,
        99
    )

    if risk_score >= 75:
        level = "CRITICAL"

    elif risk_score >= 55:
        level = "HIGH"

    elif risk_score >= 30:
        level = "MEDIUM"

    else:
        level = "LOW"

    return {

        "well_id": well_id,

        "depth": depth,

        "formation":
            "Formation-Y",

        "signals":
            signals,

        "warnings":
            warnings,

        "risk": {

            "score":
                risk_score,

            "level":
                level,

            "score_type":
                "explainable_index_0_100",

            "is_probability":
                False,

            "contributors": [
                {
                    "key": "thresholds",
                    "label": (
                        "Precursor thresholds crossed"
                    ),
                    "points": round(
                        len(warnings) * 18, 1
                    ),
                    "max_points": 72,
                    "detail": (
                        f"{len(warnings)} of 4 precursor "
                        f"thresholds crossed, "
                        f"+18 points each"
                    )
                },
                {
                    "key": "depth_progress",
                    "label": "Depth progress",
                    "points": round(
                        max(step - 4, 0) * 3, 1
                    ),
                    "max_points": None,
                    "detail": (
                        f"Step {step} of 8, "
                        f"+{max(step - 4, 0) * 3} points "
                        f"beyond step 4"
                    )
                }
            ],

            "reasons":
                warnings or [
                    "No significant precursor detected"
                ]
        },

        "clock": (
            datetime.now(timezone.utc).strftime(
                "%H:%M:%S.%f"
            )[:-3]
        ),

        "clock_source": (
            "Server wall-clock time over a simulated "
            "parameter stream. Simulation time, not rig "
            "time."
        ),

        "streaming": True

    }

@app.get("/api/nwis/{well_id}")
def unified_nwis(
    well_id: str,
    depth: float = 2840
):

    require_well(well_id)

    # =====================================================
    # 1. OFFSET INTELLIGENCE
    # =====================================================

    offsets = rank_offsets(
        active_well_id=well_id,
        top_k=7
    )

    # --------------------------------------------
    # OFFSET INTELLIGENCE (with map coordinates)
    # --------------------------------------------

    active_well_data, offsets = attach_coordinates(
        well_id,
        offsets
    )

    # =====================================================
    # 2. DEPTH / FORMATION INTELLIGENCE
    # =====================================================

    depth_analysis = analyze_depth_risk(
        active_well_id=well_id,
        current_depth=depth,
        radius_m=50
    )

    formation = depth_analysis.get(
        "formation",
        "UNKNOWN"
    )

    historical_events = (
        depth_analysis.get(
            "events",
            []
        )
    )

    historical_count = (
        depth_analysis.get(
            "matching_events",
            len(historical_events)
        )
    )

    # =====================================================
    # 3. CURRENT DRILLING SIGNALS
    # =====================================================

    current_records = [

        {
            "rop": 24,
            "torque": 15,
            "ecd": 1.18,
            "pit_volume": 100
        },

        {
            "rop": 22,
            "torque": 17,
            "ecd": 1.19,
            "pit_volume": 99
        },

        {
            "rop": 19,
            "torque": 19,
            "ecd": 1.21,
            "pit_volume": 98
        },

        {
            "rop": 16,
            "torque": 22,
            "ecd": 1.24,
            "pit_volume": 96
        },

        {
            "rop": 12,
            "torque": 27,
            "ecd": 1.28,
            "pit_volume": 94
        }
    ]

    risk = calculate_risk(
        current_records
    )

    # =====================================================
    # 4. HISTORICAL EVENT CORROBORATION
    # =====================================================

    event_counts = {}

    for event in historical_events:

        event_name = str(
            event.get(
                "event",
                "UNKNOWN"
            )
        )

        event_counts[event_name] = (
            event_counts.get(
                event_name,
                0
            ) + 1
        )

    dominant_event = None

    if event_counts:

        dominant_event = max(
            event_counts,
            key=event_counts.get
        )

    # =====================================================
    # 5. CONTEXTUAL RISK SCORE
    # =====================================================

    evidence_bonus = min(
        historical_count * 3,
        15
    )

    contextual_score = min(
        risk["risk_score"]
        + evidence_bonus,
        100
    )

    contributors, contributors_total, reconciles = (
        build_contributors(risk, evidence_bonus)
    )

    risk_level = contextual_level(contextual_score)

    # =====================================================
    # 6. RAG QUERY
    # =====================================================

    event_for_search = (
        dominant_event
        or risk.get(
            "event",
            ""
        )
    )

    rag_query = (
        f"historical drilling event "
        f"{formation} "
        f"around {depth} meters "
        f"{event_for_search} "
        f"risk mitigation lesson learned"
    )

    # =====================================================
    # 6. HYBRID RETRIEVAL
    #
    # Lexical BM25 + vector cosine, with the active
    # formation, the bit depth and the dominant event
    # applied as hard metadata filters. Scoring is done
    # by rag.hybrid_search; this call only supplies the
    # drilling context the ranking must respect.
    # =====================================================

    document_evidence = hybrid_search(
        query=rag_query,
        top_k=5,
        formation=formation,
        event_type=event_for_search or None,
        reference_depth=depth,
        depth_window_m=50
    )

    # =====================================================
    # 7. RECOMMENDATION
    # =====================================================

    recommendation = generate_recommendation(
        risk_event=event_for_search,
        evidence=document_evidence
    )

    # =====================================================
    # 8. ALERT
    # =====================================================

    alert_triggered = (
        contextual_score >= 55
    )

    if alert_triggered:

        alert_message = (
            f"{risk_level} contextual risk "
            f"detected at {depth} m in "
            f"{formation}."
        )

    else:

        alert_message = (
            "No high-priority contextual "
            "risk detected."
        )

    # =====================================================
    # 9. EXPLAINABILITY LAYERS
    #
    # Purely additive. Everything below is derived from the
    # values already computed above; nothing is re-scored
    # and nothing is invented.
    # =====================================================

    ranking_diagnostics = offset_ranking_diagnostics(
        active_well_id=well_id
    )

    why_now = build_why_now(
        active_well_id=well_id,
        current_depth=depth,
        baseline_signals=baseline_signals(
            current_records
        ),
        current_signals=current_signals(
            current_records
        ),
        window_m=50,
        signal_source=DEMO_SIGNAL_SOURCE
    )

    # Alert lifecycle: open or advance a tracked alert for
    # this well at this severity. Re-entering the same
    # severity at a new depth is a new observation, so the
    # registry is keyed on severity + predicted event.
    tracked_alert = None

    lifecycle_key = (
        f"{well_id}:{risk_level}:"
        f"{risk.get('event', 'UNKNOWN')}"
    )

    if alert_triggered:

        existing = next(
            (
                a for a in ALERT_REGISTRY.list(
                    well_id=well_id
                )
                if a["lifecycle"]
                and a["lifecycle"][0].get("note")
                and lifecycle_key in a["lifecycle"][0]["note"]
            ),
            None
        )

        if existing is None:

            tracked_alert = (
                ALERT_REGISTRY.open_alert(
                    well_id=well_id,
                    depth=depth,
                    formation=formation,
                    title=(
                        f"{risk_level} contextual risk"
                    ),
                    severity=risk_level,
                    predicted_event=risk.get(
                        "event", "UNKNOWN"
                    ),
                    risk_score=round(
                        contextual_score, 1
                    ),
                    note=(
                        f"Key {lifecycle_key} · "
                        f"{alert_message}"
                    )
                )
            )

        else:

            tracked_alert = existing

        if historical_count > 0:

            correlated, _ = (
                ALERT_REGISTRY.correlate(
                    tracked_alert["id"],
                    (
                        f"{historical_count} historical "
                        f"event(s) within ±50 m in "
                        f"{formation}"
                    )
                )
            )

            tracked_alert = correlated or tracked_alert

    else:

        tracked_alert = None

    alert_lifecycle = ALERT_REGISTRY.snapshot(
        well_id=well_id
    )

    if tracked_alert:

        alert_lifecycle["tracked"] = tracked_alert

    # =====================================================
    # 9. RETURN UNIFIED INTELLIGENCE
    # =====================================================

    return {

        "system": "NWIS",

        "version": "1.0-demo",

        "well": {

            "well_id":
                well_id,

            "depth":
                depth,

            "formation":
                formation
        },

        "active_well_data":
            active_well_data,


        "risk": {

            "score":
                round(
                    contextual_score,
                    1
                ),

            "level":
                risk_level,

            "predicted_event":
                risk.get(
                    "event",
                    "UNKNOWN"
                ),

            "contextual_event":
                dominant_event,

            "signals":
                risk.get(
                    "signals",
                    {}
                ),

            "reasons":
                risk.get(
                    "reasons",
                    []
                ),

            # ---- Part B: contribution breakdown ----

            "score_type":
                "explainable_index_0_100",

            "is_probability":
                False,

            "contributors":
                contributors,

            "contributors_total":
                contributors_total,

            "contributors_reconcile":
                reconciles,

            "historical_bonus":
                evidence_bonus,

            "risk_model":
                risk.get(
                    "risk_model",
                    RISK_MODEL
                )

        },

        "offsets": offsets,

        "offset_diagnostics":
            ranking_diagnostics,

        "historical_events":
            historical_events,

        "historical_event_count":
            historical_count,

        "depth_correlation":
            depth_analysis.get(
                "correlation",
                {}
            ),

        "document_evidence":
            document_evidence,

        "retrieval": {
            "query": rag_query,
            "mode": "hybrid",
            "config": HYBRID_CONFIG,
            "filters": {
                "formation": formation,
                "event_type":
                    event_for_search or None,
                "reference_depth": depth,
                "depth_window_m": 50
            },
            "returned":
                len(document_evidence),
            "index": {
                "embedding_model": MODEL_NAME,
                "metric":
                    HYBRID_CONFIG["vector_metric"]
            }
        },

        "why_now": why_now,

        "recommendation":
            recommendation,

        "alert": {

            "triggered":
                alert_triggered,

            "severity":
                risk_level,

            "message":
                alert_message,

            "lifecycle":
                alert_lifecycle
        },

        "explainability": {

            "risk_source":
                "Current drilling precursors",

            "historical_source":
                "Offset wells + historical documents",

            "retrieval_query":
                rag_query,

            "offset_ranking_model": {
                "weights": dict(OFFSET_WEIGHTS)
            },

            "risk_index_note": (
                "Every index in this payload is a 0-100 "
                "explainable score. None is a probability, "
                "and none is a validated prediction of "
                "failure. See /api/claim-audit."
            )
        },

        "data_provenance": {
            "wells":
                "data/wells.csv — synthetic",
            "events":
                "data/events.csv — synthetic",
            "telemetry":
                "data/drilling_data.csv — synthetic",
            "documents":
                "data/documents/*.txt — synthetic "
                "narrative DDRs",
            "connection": (
                "No Oil India Limited or eRTMAC "
                "connection. Demonstration data only."
            )
        }

    }

@app.post("/api/rag/build")
def build_rag_index():
    return build_index()


# =====================================================
# EXPLAINABILITY, LIFECYCLE AND EVALUATION ROUTES
#
# All additive. Nothing below changes the behaviour of an
# existing route.
# =====================================================

@app.get("/api/risk/contributors")
def risk_contributors(
    well_id: str = "WELL-001",
    depth: float = 2840
):
    """
    Full contribution breakdown of the risk index for the
    active bit position, plus the model definition and the
    historical corroboration bonus, so every point in the
    score can be traced to a named rule.
    """

    require_well(well_id)

    records = DEMO_RECORDS
    risk = calculate_risk(records)

    depth_analysis = analyze_depth_risk(
        active_well_id=well_id,
        current_depth=depth,
        radius_m=50
    )

    matching = depth_analysis["matching_events"]
    evidence_bonus = min(matching * 3, 15)

    signal_score = risk["risk_score"]
    contextual = min(signal_score + evidence_bonus, 100)

    contributors, contributors_total, reconciles = (
        build_contributors(risk, evidence_bonus)
    )

    level = contextual_level(contextual)

    return {
        "well_id": well_id,
        "depth": depth,
        "formation": depth_analysis["formation"],

        "signal_index": {
            "score": signal_score,
            "level": risk["risk_level"]
        },

        "historical_bonus": evidence_bonus,

        "contextual_index": {
            "score": round(contextual, 1),
            "level": level
        },

        "contributors": contributors,
        "contributors_total": contributors_total,
        "reconciles": reconciles,

        "reasons": risk["reasons"],
        "signals": risk["signals"],

        "model": risk.get("risk_model", RISK_MODEL),

        "disclaimer": (
            "The index is a weighted sum of parameter "
            "trends. It is not a calibrated probability and "
            "has not been validated against incident "
            "outcomes."
        )
    }


@app.get("/api/why-now/{well_id}")
def why_now(
    well_id: str,
    depth: float = 2840,
    window: float = 50,
    rop: float = None,
    torque: float = None,
    ecd: float = None,
    pit_volume: float = None
):
    """
    Why-now explanation for a bit position.

    If the four live parameter values are supplied they are
    used as the current frame and compared against the first
    frame of the demonstration record, so the panel tracks
    the live stream. Otherwise the demonstration record is
    scored and the payload says so.
    """

    require_well(well_id)

    supplied = {
        "rop": rop,
        "torque": torque,
        "ecd": ecd,
        "pit_volume": pit_volume
    }

    live_frame = all(v is not None for v in supplied.values())

    if live_frame:

        records = [DEMO_RECORDS[0], supplied]
        source = (
            "Live frame supplied by the client, compared "
            "against the first frame of the demonstration "
            "record"
        )

    else:

        records = DEMO_RECORDS
        source = DEMO_SIGNAL_SOURCE

    risk = calculate_risk(records)

    return build_why_now(
        active_well_id=well_id,
        current_depth=depth,
        baseline_signals=baseline_signals(records),
        current_signals=current_signals(records),
        window_m=window,
        signal_source=source
    ) | {
        "risk_index": {
            "score": risk["risk_score"],
            "level": risk["risk_level"],
            "contributors": risk.get("contributors", []),
            "is_probability": False
        }
    }


@app.get("/api/wells/{well_id}/offset-diagnostics")
def offset_diagnostics(well_id: str):
    """
    Answers, from the real ranking, whether the offset
    engine is anything more than a nearest-well lookup.
    """

    require_well(well_id)

    return offset_ranking_diagnostics(
        active_well_id=well_id
    )


@app.get("/api/alerts")
def alerts_list(well_id: str = None, limit: int = 50):
    return ALERT_REGISTRY.snapshot(well_id=well_id)


@app.get("/api/alerts/{alert_id}")
def alert_detail(alert_id: str):
    record = ALERT_REGISTRY.get(alert_id)

    if record is None:

        return {
            "found": False,
            "alert_id": alert_id
        }

    return {"found": True, **record}


@app.post("/api/alerts/{alert_id}/state")
def alert_set_state(
    alert_id: str,
    state: str,
    note: str = None,
    actor: str = None
):
    """
    Advance a tracked alert through the lifecycle.

    Validated server-side: unknown stages, backwards moves
    and out-of-order acknowledgement are rejected with 409.
    """

    if state not in ("ACKNOWLEDGED", "RESOLVED"):

        return {
            "error": "unsupported_transition",
            "detail": (
                "An operator may set ACKNOWLEDGED or "
                "RESOLVED. Earlier stages are recorded "
                "automatically by the engine."
            ),
            "requested": state,
            "allowed": ["ACKNOWLEDGED", "RESOLVED"]
        }

    record, error = ALERT_REGISTRY.set_state(
        alert_id, state, note=note, actor=actor
    )

    if error:

        return {
            "error": "transition_rejected",
            "detail": error,
            "alert_id": alert_id
        }

    return {"ok": True, "alert": record}


@app.get("/api/retrieval/config")
def retrieval_config():
    """
    The live retrieval configuration, so the reported
    hybrid weights are read from the code rather than
    restated in documentation.
    """

    index, documents = load_index()

    return {
        "model": MODEL_NAME,
        "hybrid": HYBRID_CONFIG,
        "corpus": {
            "chunks": len(documents or []),
            "vectors": int(index.ntotal) if index else 0,
            "dimension": int(index.d) if index else None,
            "sources": sorted({
                (d.get("metadata") or {}).get("source")
                for d in (documents or [])
            })
        },
        "filters_supported": [
            "well_id",
            "formation",
            "event_type",
            "reference_depth + depth_window_m",
            "min_depth / max_depth"
        ],
        "notes": [
            "Hybrid score is a similarity, not a probability.",
            "A chunk with no recorded depth is never "
            "rejected on a depth filter; the depth term is "
            "reported as unavailable instead.",
            "Page numbers are only present for paginated "
            "sources. Plain-text documents report page as "
            "unavailable."
        ]
    }


@app.get("/api/claim-audit")
def claim_audit_route():
    """
    Every statement the system makes about itself, classified
    against what this repository actually does. Served from
    code so the interface, the documentation and the
    submission cannot drift apart.
    """

    return claim_audit()


EVALUATION_RESULTS = (
    Path(__file__).resolve().parents[1]
    / "evaluation" / "results"
)


def _load_evaluation(name):
    path = EVALUATION_RESULTS / name

    if not path.exists():

        return None

    try:

        return json.loads(
            path.read_text(encoding="utf-8")
        )

    except (OSError, ValueError):

        return None


@app.get("/api/evaluation")
def evaluation_report():
    """
    The measured prototype evaluation.

    Served from evaluation/results/evaluation.json, which is
    produced by `python -m evaluation.evaluate`. Every field
    is either a number this repository computed or null with
    a stated reason.
    """

    payload = _load_evaluation("evaluation.json")

    if payload is None:

        return {
            "available": False,
            "reason": (
                "evaluation/results/evaluation.json has not "
                "been generated. Run: "
                "python -m evaluation.evaluate"
            )
        }

    return {
        "available": True,
        "evaluation": payload
    }


@app.get("/api/evaluation/replay")
def evaluation_replay():
    """
    Historical replay results, including the circularity
    finding that withholds the detection rate.
    """

    payload = _load_evaluation("replay.json")

    if payload is None:

        return {
            "available": False,
            "reason": (
                "evaluation/results/replay.json has not been "
                "generated. Run: "
                "python -m evaluation.replay --all"
            )
        }

    return {
        "available": True,
        "replay": payload
    }


@app.get("/api/risk/model")
def risk_model():
    """
    The rule set, thresholds and saturation points actually
    used by the engine, plus an explicit statement of what
    the model is not.
    """

    records = DEMO_RECORDS
    result = calculate_risk(records)

    return {
        "model": result.get("risk_model", RISK_MODEL),
        "levels": [
            {"level": "LOW", "min": 0, "max": 30},
            {"level": "MEDIUM", "min": 30, "max": 55},
            {"level": "HIGH", "min": 55, "max": 75},
            {"level": "CRITICAL", "min": 75, "max": 100}
        ],
        "calibration": {
            "calibrated": False,
            "is_probability": False,
            "precision": None,
            "recall": None,
            "f1": None,
            "validated_on": None,
            "status": "NOT VALIDATED",
            "reason": (
                "No labelled incident dataset is available "
                "in this repository. The demonstration event "
                "table is synthetic and is not an evaluation "
                "set. A calibrated probability model is a "
                "PRODUCTION PATH item."
            )
        },
        "production_validation_path": [
            "Curate a labelled real incident dataset from "
            "the operator's historical wells",
            "Fit and cross-validate on the labelled set",
            "Calibrate the output against observed base "
            "rates (isotonic / Platt)",
            "Report precision, recall and lead distance "
            "with confidence intervals",
            "Add uncertainty bounds and expert review"
        ]
    }


# =====================================================
# DOCUMENT INTELLIGENCE (READ-ONLY VIEWS)
#
# The frontend needs an honest inventory of what the
# retrieval layer actually holds. These endpoints only
# read the existing FAISS index + chunk metadata that
# build_index() already produced. No re-embedding,
# no re-scoring, no new pipeline.
# =====================================================

def _document_inventory():
    """Group the real chunk metadata by source document."""
    index, chunks = load_index()

    grouped = {}

    for chunk in chunks:
        metadata = chunk.get("metadata", {})
        source = metadata.get("source", "UNKNOWN")

        entry = grouped.setdefault(
            source,
            {
                "source": source,
                "chunks": 0,
                "chunk_ids": [],
                "well_id": metadata.get("well_id", "UNKNOWN"),
                "formation": metadata.get("formation", "UNKNOWN"),
                "depth": metadata.get("depth"),
                "events": set(),
                "characters": 0
            }
        )

        entry["chunks"] += 1
        entry["chunk_ids"].append(chunk.get("id"))
        entry["characters"] += len(chunk.get("text", ""))

        event = metadata.get("event")
        if event and event != "UNKNOWN":
            entry["events"].add(event)

    sources = []

    for source, entry in sorted(grouped.items()):
        path = DOCS_DIR / source
        sources.append({
            "source": source,
            "format": (
                path.suffix.lower().lstrip(".")
                if path.exists() else "unknown"
            ),
            "available": path.exists(),
            "bytes": (
                path.stat().st_size if path.exists() else None
            ),
            "chunks": entry["chunks"],
            "chunk_ids": entry["chunk_ids"],
            "characters": entry["characters"],
            "well_id": entry["well_id"],
            "formation": entry["formation"],
            "depth": entry["depth"],
            "events": sorted(entry["events"]),
            "requires_ocr": path.suffix.lower() == ".pdf"
        })

    return index, chunks, sources


@app.get("/api/documents")
def documents():
    """
    Real ingestion statistics taken straight from the
    FAISS index and the chunk metadata store.
    """

    index, chunks, sources = _document_inventory()

    if index is None:
        return {
            "index": None,
            "totals": {
                "documents": 0,
                "chunks": 0,
                "vectors": 0,
                "pdf_documents": 0,
                "text_documents": 0,
                "wells_referenced": 0
            },
            "sources": [],
            "pipeline": {
                "embedding_model": MODEL_NAME,
                "metric": "cosine (normalised inner product)",
                "extraction": (
                    "PDF text extraction with per-page OCR "
                    "fallback when a page yields under 40 "
                    "characters"
                )
            }
        }

    return {
        "index": {
            "vectors": int(index.ntotal),
            "dimension": int(index.d)
        },
        "totals": {
            "documents": len(sources),
            "chunks": len(chunks),
            "vectors": int(index.ntotal),
            "pdf_documents": sum(
                1 for s in sources if s["format"] == "pdf"
            ),
            "text_documents": sum(
                1 for s in sources if s["format"] in ("txt", "md")
            ),
            "wells_referenced": len({
                s["well_id"] for s in sources
            })
        },
        "sources": sources,
        "pipeline": {
            "embedding_model": MODEL_NAME,
            "metric": "cosine (normalised inner product)",
            "extraction": (
                "PDF text extraction with per-page OCR "
                "fallback when a page yields under 40 "
                "characters"
            )
        }
    }


@app.get("/api/documents/detail")
def document_detail(source: str):
    """
    Full indexed text for a single source document so
    the operator can verify an AI conclusion against
    the original wording.
    """

    _, chunks, _ = _document_inventory()

    selected = [
        chunk for chunk in chunks
        if chunk.get("metadata", {}).get("source") == source
    ]

    if not selected:
        return {
            "source": source,
            "found": False,
            "chunks": []
        }

    return {
        "source": source,
        "found": True,
        "metadata": selected[0].get("metadata", {}),
        "chunks": [
            {
                "id": chunk.get("id"),
                "text": chunk.get("text", ""),
                "metadata": chunk.get("metadata", {})
            }
            for chunk in selected
        ]
    }

@app.get("/api/rag/search")
def rag_search(
    q: str,
    top_k: int = 5,
    mode: str = "hybrid",
    well_id: str = None,
    formation: str = None,
    event_type: str = None,
    reference_depth: float = None,
    depth_window_m: float = 50
):
    """
    Hybrid lexical + vector retrieval over the indexed
    chunk store, with drilling-domain metadata filters.

    mode=vector reproduces the original vector-only
    behaviour for comparison.
    """

    if mode not in ("hybrid", "vector", "lexical"):

        return {
            "error": "unsupported_mode",
            "detail": (
                "mode must be one of hybrid, vector, lexical"
            )
        }

    results = hybrid_search(
        query=q,
        top_k=top_k,
        well_id=well_id,
        formation=formation,
        event_type=event_type,
        reference_depth=reference_depth,
        depth_window_m=depth_window_m,
        mode=mode
    )

    return {
        "query": q,
        "mode": mode,
        "filters": {
            "well_id": well_id,
            "formation": formation,
            "event_type": event_type,
            "reference_depth": reference_depth,
            "depth_window_m": depth_window_m
        },
        "config": HYBRID_CONFIG,
        "returned": len(results),
        "results": results
    }

@app.websocket("/ws/live/{well_id}")
async def live(websocket:WebSocket, well_id:str):
    await websocket.accept()

    if find_well(well_id) is None:
        await websocket.send_json({
            "error": "unknown_well",
            "detail": (
                f"{well_id} is not present in "
                f"data/wells.csv."
            )
        })
        await websocket.close(code=1008)
        return

    df=pd.read_csv(DATA/"drilling_data.csv")
    records=simulate_live(df,well_id)

    if not records:
        await websocket.send_json({
            "error": "no_telemetry",
            "detail": (
                f"No telemetry rows are recorded for "
                f"{well_id}."
            )
        })
        await websocket.close(code=1008)
        return
    # Replay a short final-window scenario for the demo.
    for i in range(5, min(len(records), 55)):
        window=records[max(0,i-4):i+1]
        payload=window[-1].copy()
        payload["risk"]=risk_score(window)
        await websocket.send_json(payload)
        await asyncio.sleep(0.5)
    await websocket.close()
