from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import pandas as pd, asyncio, json

from ml.offset_similarity import (
    rank_offsets,
    analyze_depth_risk
)
from ml.risk_engine import risk_score, simulate_live, calculate_risk
from rag.rag_engine import (
    build_index,
    search_documents,
    load_index,
    MODEL_NAME,
    DOCS_DIR
)
from backend.recommendations import (
    generate_recommendation
)

app=FastAPI(title="NWIS — Nearby Wells Intelligence System", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

DATA=Path(__file__).resolve().parents[1]/"data"

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
    return analyze_depth_risk(
        active_well_id=well_id,
        current_depth=depth,
        radius_m=radius
    )

@app.get("/api/evidence/{well_id}")
def evidence(well_id:str):
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

    results = search_documents(
        query=query,
        top_k=5
    )

    return {
        "formation": formation,
        "depth": depth,
        "event": event,
        "results": results
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

    results = search_documents(
        query=query,
        top_k=5
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

    evidence = search_documents(
        query=query,
        top_k=5
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
        matching_event_count * 3,
        15
    )

    contextual_risk = min(
        risk["risk_score"]
        + evidence_bonus,
        100
    )

    # ----------------------------------------
    # 7. FINAL RISK LEVEL
    # ----------------------------------------

    if contextual_risk >= 75:

        final_level = "CRITICAL"

    elif contextual_risk >= 55:

        final_level = "HIGH"

    elif contextual_risk >= 30:

        final_level = "MEDIUM"

    else:

        final_level = "LOW"

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
                level

        },

        "streaming": True

    }

@app.get("/api/nwis/{well_id}")
def unified_nwis(
    well_id: str,
    depth: float = 2840
):

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

    if contextual_score >= 75:

        risk_level = "CRITICAL"

    elif contextual_score >= 55:

        risk_level = "HIGH"

    elif contextual_score >= 30:

        risk_level = "MEDIUM"

    else:

        risk_level = "LOW"

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

    document_evidence = search_documents(
        query=rag_query,
        top_k=5
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
                )

        },

        "offsets": offsets,

        "historical_events":
            historical_events,

        "historical_event_count":
            historical_count,

        "document_evidence":
            document_evidence,

        "recommendation":
            recommendation,

        "alert": {

            "triggered":
                alert_triggered,

            "severity":
                risk_level,

            "message":
                alert_message

        },

        "explainability": {

            "risk_source":
                "Current drilling precursors",

            "historical_source":
                "Offset wells + historical documents",

            "retrieval_query":
                rag_query

        }

    }

@app.post("/api/rag/build")
def build_rag_index():
    return build_index()


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
    top_k: int = 5
):

    results = search_documents(
        query=q,
        top_k=top_k
    )

    return {
        "query": q,
        "results": results
    }

@app.websocket("/ws/live/{well_id}")
async def live(websocket:WebSocket, well_id:str):
    await websocket.accept()
    df=pd.read_csv(DATA/"drilling_data.csv")
    records=simulate_live(df,well_id)
    # Replay a short final-window scenario for the demo.
    for i in range(5, min(len(records), 55)):
        window=records[max(0,i-4):i+1]
        payload=window[-1].copy()
        payload["risk"]=risk_score(window)
        await websocket.send_json(payload)
        await asyncio.sleep(0.5)
    await websocket.close()
