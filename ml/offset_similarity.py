import math
import pandas as pd
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0

    p1 = math.radians(lat1)
    p2 = math.radians(lat2)

    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = (
        math.sin(dp / 2) ** 2
        + math.cos(p1)
        * math.cos(p2)
        * math.sin(dl / 2) ** 2
    )

    return 2 * r * math.asin(math.sqrt(a))


def depth_similarity(current_depth, event_depth, tolerance=300):
    difference = abs(current_depth - event_depth)

    return max(
        0,
        1 - difference / tolerance
    )


def analyze_depth_risk(
    active_well_id="WELL-001",
    current_depth=2840,
    radius_m=50
):

    wells = pd.read_csv(DATA / "wells.csv")
    events = pd.read_csv(DATA / "events.csv")

    active = wells[
        wells.well_id == active_well_id
    ].iloc[0]

    relevant_events = []

    for _, event in events.iterrows():

        # Same formation
        if event.formation != active.formation:
            continue

        depth_difference = abs(
            float(event.depth) - current_depth
        )

        if depth_difference <= radius_m:

            relevant_events.append({
                "well_id": event.well_id,
                "event": event.event,
                "historical_depth": round(
                    float(event.depth), 1
                ),
                "current_depth": current_depth,
                "depth_difference": round(
                    depth_difference, 1
                ),
                "severity": event.severity,
                "mitigation": event.mitigation,
                "source": event.source
            })

    total = len(relevant_events)

    event_counts = {}

    for event in relevant_events:

        event_type = event["event"]

        event_counts[event_type] = (
            event_counts.get(event_type, 0) + 1
        )

    return {
        "active_well": active_well_id,
        "formation": active.formation,
        "current_depth": current_depth,
        "search_window_m": radius_m,
        "matching_events": total,
        "event_counts": event_counts,
        "events": relevant_events
    }


def rank_offsets(
    active_well_id="WELL-001",
    top_k=7
):

    wells = pd.read_csv(DATA / "wells.csv")
    events = pd.read_csv(DATA / "events.csv")

    active = wells[
        wells.well_id == active_well_id
    ].iloc[0]

    results = []

    for _, well in wells.iterrows():

        if well.well_id == active_well_id:
            continue

        distance = haversine_km(
            active.latitude,
            active.longitude,
            well.latitude,
            well.longitude
        )

        geographic_similarity = max(
            0,
            1 - distance / 8
        )

        formation_similarity = float(
            active.formation == well.formation
        )

        trajectory_similarity = float(
            active.trajectory == well.trajectory
        )

        hole_similarity = float(
            active.hole_section == well.hole_section
        )

        depth_similarity_score = max(
            0,
            1 - abs(
                active.total_depth
                - well.total_depth
            ) / 1500
        )

        well_events = events[
            events.well_id == well.well_id
        ]

        same_formation_events = well_events[
            well_events.formation
            == active.formation
        ]

        event_similarity = min(
            len(same_formation_events) / 2,
            1
        )

        score = 100 * (
            0.20 * geographic_similarity
            + 0.25 * formation_similarity
            + 0.15 * depth_similarity_score
            + 0.15 * trajectory_similarity
            + 0.15 * hole_similarity
            + 0.10 * event_similarity
        )

        historical_events = []

        for _, event in same_formation_events.iterrows():

            historical_events.append({
                "event": event.event,
                "depth": round(
                    float(event.depth), 1
                ),
                "severity": event.severity,
                "mitigation": event.mitigation,
                "source": event.source
            })

        results.append({

            "well_id": well.well_id,

            "distance_km": round(
                distance, 2
            ),

            "similarity_score": round(
                score, 1
            ),

            "formation": well.formation,

            "trajectory": well.trajectory,

            "hole_section": well.hole_section,

            "historical_event_count":
                len(historical_events),

            "historical_events":
                historical_events
        })

    results.sort(
        key=lambda x:
            x["similarity_score"],
        reverse=True
    )

    return results[:top_k]
