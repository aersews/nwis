import math
import pandas as pd
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


# =========================================================
# RANKING WEIGHTS
#
# Single source of truth for the offset relevance model.
# The weights are applied in this exact order so the score
# computed below is unchanged by the explainability layer.
# =========================================================

OFFSET_WEIGHTS = {
    "distance": 0.20,
    "formation": 0.25,
    "depth": 0.15,
    "trajectory": 0.15,
    "hole_section": 0.15,
    "event": 0.10
}

# Ground distance at which the geographic term reaches zero.
DISTANCE_FLOOR_KM = 8.0

# Total-depth spread (m) at which the depth term reaches zero.
DEPTH_SPREAD_M = 1500.0

# Number of same-formation events that saturates the event term.
EVENT_SATURATION = 2


def _optional(value):
    """Return a float, or None when the field is missing.

    A factor built on a missing attribute must be reported as
    unavailable rather than silently scored as zero, otherwise
    the UI would show a confident 0% for data that was never
    recorded.
    """

    if value is None:
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if math.isnan(number):
        return None

    return number


def _factor(key, label, weight, similarity, detail):
    """One explainable ranking factor.

    `similarity` is 0..1 and is exactly the value summed into
    the relevance score. `detail` states the measurement the
    factor was derived from, so the operator can audit it.
    """

    return {
        "key": key,
        "label": label,
        "weight": weight,
        "available": similarity is not None,
        "similarity": (
            None if similarity is None else round(similarity, 4)
        ),
        "score": (
            None if similarity is None
            else round(weight * similarity * 100, 2)
        ),
        "detail": detail
    }


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


def find_well(well_id):
    """Return the well row, or None.

    Both engines are called with operator-supplied identifiers,
    so an unknown well is an expected input, not an exceptional
    one. Callers check for None rather than letting pandas raise
    an IndexError that surfaces as a 500.
    """

    wells = pd.read_csv(DATA / "wells.csv")

    match = wells[wells.well_id == well_id]

    if match.empty:

        return None

    return match.iloc[0]


def analyze_depth_risk(
    active_well_id="WELL-001",
    current_depth=2840,
    radius_m=50
):

    active = find_well(active_well_id)

    if active is None:

        return {
            "active_well": active_well_id,
            "formation": None,
            "current_depth": current_depth,
            "search_window_m": radius_m,
            "matching_events": 0,
            "event_counts": {},
            "events": [],
            "well_found": False,
            "correlation": {
                "method": "Depth-window correlation",
                "measured_depth": current_depth,
                "measured_depth_available": True,
                "true_vertical_depth": None,
                "true_vertical_depth_available": False,
                "trajectory_survey": None,
                "trajectory_survey_available": False,
                "formation_tops": None,
                "formation_tops_available": False,
                "stratigraphic_correlation": False,
                "note": (
                    "The requested well is not in wells.csv, "
                    "so no formation is available to correlate "
                    "against and no event is returned."
                ),
                "production_path": (
                    "MD + TVD + trajectory + formation tops "
                    "+ stratigraphic framework"
                )
            }
        }

    events = pd.read_csv(DATA / "events.csv")

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
        "events": relevant_events,
        "well_found": True,

        # ---- correlation honesty (Part L) ----

        "correlation": {
            "method": "Depth-window correlation",
            "measured_depth": current_depth,
            "measured_depth_available": True,
            "true_vertical_depth": None,
            "true_vertical_depth_available": False,
            "trajectory_survey": None,
            "trajectory_survey_available": False,
            "formation_tops": None,
            "formation_tops_available": False,
            "stratigraphic_correlation": False,
            "note": (
                "Matching is a measured-depth window "
                "within a single named formation. The "
                "demonstration dataset holds no TVD, no "
                "directional survey, no formation tops "
                "and no stratigraphic framework, so no "
                "geological correlation is claimed."
            ),
            "production_path": (
                "MD + TVD + trajectory + formation tops "
                "+ stratigraphic framework"
            )
        }
    }


def rank_offsets(
    active_well_id="WELL-001",
    top_k=7
):

    active = find_well(active_well_id)

    if active is None:

        return []

    wells = pd.read_csv(DATA / "wells.csv")
    events = pd.read_csv(DATA / "events.csv")

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
            1 - distance / DISTANCE_FLOOR_KM
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

        active_total_depth = _optional(
            active.total_depth
        )

        well_total_depth = _optional(
            well.total_depth
        )

        if (
            active_total_depth is None
            or well_total_depth is None
        ):

            depth_similarity_score = None

        else:

            depth_similarity_score = max(
                0,
                1 - abs(
                    active_total_depth
                    - well_total_depth
                ) / DEPTH_SPREAD_M
            )

        well_events = events[
            events.well_id == well.well_id
        ]

        same_formation_events = well_events[
            well_events.formation
            == active.formation
        ]

        event_similarity = min(
            len(same_formation_events)
            / EVENT_SATURATION,
            1
        )

        # -----------------------------------------
        # EXPLICIT FACTOR TABLE (Part A / Part G)
        #
        # Each entry is the exact value summed above.
        # Order matches OFFSET_WEIGHTS so the score below
        # is arithmetically identical to the original
        # implementation.
        # -----------------------------------------

        factors = {

            "distance": _factor(
                "distance",
                "Distance",
                OFFSET_WEIGHTS["distance"],
                geographic_similarity,
                (
                    f"{round(distance, 2)} km offset, "
                    f"linear decay to zero at "
                    f"{DISTANCE_FLOOR_KM:.0f} km "
                    f"(haversine, WGS-84 coordinates)"
                )
            ),

            "formation": _factor(
                "formation",
                "Formation match",
                OFFSET_WEIGHTS["formation"],
                formation_similarity,
                (
                    f"{well.formation} vs "
                    f"{active.formation}"
                    if pd.notna(well.formation)
                    and pd.notna(active.formation)
                    else "Formation not recorded for one "
                         "or both wells"
                )
            ),

            "depth": _factor(
                "depth",
                "Depth proximity",
                OFFSET_WEIGHTS["depth"],
                depth_similarity_score,
                (
                    f"Total-depth difference "
                    f"{round(abs(active_total_depth - well_total_depth), 1)} m, "
                    f"linear decay to zero at "
                    f"{DEPTH_SPREAD_M:.0f} m spread. "
                    f"Total-depth proxy — no MD/TVD "
                    f"survey is available"
                    if depth_similarity_score is not None
                    else "Total depth not recorded for one "
                         "or both wells"
                )
            ),

            "trajectory": _factor(
                "trajectory",
                "Trajectory",
                OFFSET_WEIGHTS["trajectory"],
                trajectory_similarity,
                (
                    f"{well.trajectory} vs "
                    f"{active.trajectory} "
                    f"(profile class only — no "
                    f"directional survey in the dataset)"
                    if pd.notna(well.trajectory)
                    and pd.notna(active.trajectory)
                    else "Trajectory profile not recorded"
                )
            ),

            "hole_section": _factor(
                "hole_section",
                "Hole section",
                OFFSET_WEIGHTS["hole_section"],
                hole_similarity,
                (
                    f'{well.hole_section} vs '
                    f'{active.hole_section} '
                    f"(casing / hole size class)"
                    if pd.notna(well.hole_section)
                    and pd.notna(active.hole_section)
                    else "Hole section not recorded"
                )
            ),

            "event": _factor(
                "event",
                "Event similarity",
                OFFSET_WEIGHTS["event"],
                event_similarity,
                (
                    f"{len(same_formation_events)} "
                    f"logged event(s) in "
                    f"{active.formation}; saturates at "
                    f"{EVENT_SATURATION}"
                )
            )
        }

        # Same order, same operations, same result.
        score = 100 * (
            0.20 * geographic_similarity
            + 0.25 * formation_similarity
            + 0.15 * (depth_similarity_score or 0.0)
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
                historical_events,

            # ---- explainability layer (additive) ----

            "factors": factors,

            "factor_order": list(
                OFFSET_WEIGHTS.keys()
            ),

            "ranking_model": {
                "method": (
                    "Fixed-weight similarity sum over six "
                    "explainable factors"
                ),
                "weights": dict(OFFSET_WEIGHTS),
                "calibrated": False,
                "is_probability": False,
                "note": (
                    "An uncalibrated relevance index. "
                    "It ranks analogue quality; it does not "
                    "estimate the likelihood of an incident."
                )
            }
        })

    results.sort(
        key=lambda x:
            x["similarity_score"],
        reverse=True
    )

    return results[:top_k]


# =========================================================
# RANKING DIAGNOSTICS
#
# Answers, from the real ranking, the question a reviewer
# asks first: "is this just the nearest well?"
# =========================================================

def offset_ranking_diagnostics(
    active_well_id="WELL-001",
    top_k=7
):

    if find_well(active_well_id) is None:

        return {
            "active_well": active_well_id,
            "well_found": False,
            "nearest_well": None,
            "top_ranked_well": None,
            "nearest_rank": None,
            "nearest_score": None,
            "top_ranked_score": None,
            "nearest_is_top_ranked": None,
            "candidates_scored": 0,
            "statement": (
                f"{active_well_id} is not present in "
                f"wells.csv, so no offset ranking could be "
                f"computed."
            ),
            "evidence": {}
        }

    ranked = rank_offsets(
        active_well_id=active_well_id,
        top_k=len(
            pd.read_csv(DATA / "wells.csv")
        )
    )

    if not ranked:
        return {
            "active_well": active_well_id,
            "nearest_well": None,
            "top_ranked_well": None,
            "nearest_rank": None,
            "nearest_score": None,
            "top_ranked_score": None,
            "nearest_is_top_ranked": None,
            "statement": "No offset wells available",
            "evidence": {}
        }

    by_distance = sorted(
        ranked,
        key=lambda x: x["distance_km"]
    )

    nearest = by_distance[0]
    top = ranked[0]

    nearest_rank = (
        ranked.index(nearest) + 1
    )

    same = nearest["well_id"] == top["well_id"]

    if same:

        statement = (
            f"For this well the nearest neighbour "
            f"({nearest['well_id']}, "
            f"{nearest['distance_km']} km) is also the "
            f"top-ranked analogue "
            f"({top['similarity_score']} / 100). "
            f"Distance dominance cannot be excluded "
            f"from a single case."
        )

    else:

        statement = (
            f"The nearest neighbour is "
            f"{nearest['well_id']} at "
            f"{nearest['distance_km']} km "
            f"(relevance "
            f"{nearest['similarity_score']} / 100), but "
            f"the engine ranks "
            f"{top['well_id']} first at "
            f"{top['distance_km']} km "
            f"(relevance {top['similarity_score']} / 100). "
            f"The ranking is therefore not a nearest-well "
            f"lookup."
        )

    return {
        "active_well": active_well_id,
        "nearest_well": nearest["well_id"],
        "nearest_distance_km": nearest["distance_km"],
        "nearest_score": nearest["similarity_score"],
        "nearest_rank": nearest_rank,
        "top_ranked_well": top["well_id"],
        "top_ranked_distance_km": top["distance_km"],
        "top_ranked_score": top["similarity_score"],
        "nearest_is_top_ranked": same,
        "candidates_scored": len(ranked),
        "statement": statement,
        "evidence": {
            "top_factors": top["factors"],
            "nearest_factors": nearest["factors"]
        }
    }
