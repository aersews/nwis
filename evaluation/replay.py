"""Historical replay evaluation.

Drills a well forward one recorded frame at a time and asks
a single question: when does NWIS raise an alert relative to
a known event that the demonstration event table records?

    lead distance = event depth - alert depth

Only quantities that were actually observed are reported.
If the repository does not contain enough material to produce
a defensible figure, the field stays ``null`` and
``insufficient_data`` explains why. Nothing is estimated and
nothing is extrapolated.

Run:

    python -m evaluation.replay --well WELL-001
    python -m evaluation.replay --all --out evaluation/results/replay.json
"""

import argparse
import json
import statistics
from pathlib import Path

import pandas as pd

from ml.risk_engine import calculate_risk
from ml.offset_similarity import analyze_depth_risk
from rag.rag_engine import hybrid_search, load_index

BASE_DIR = Path(__file__).resolve().parents[1]
DATA = BASE_DIR / "data"
RESULTS = BASE_DIR / "evaluation" / "results"

# The scripted scenario is the primary demonstration well.
PRIMARY_WELL = "WELL-001"

# Alert threshold, identical to the one in backend/main.py.
ALERT_THRESHOLD = 55.0

DEPTH_STEP_M = 10
WINDOW_M = 50

# Below this many evaluable cases the sample is reported as
# descriptive only, never as a validated rate.
MIN_CASES_FOR_RATE = 10

# The demonstration telemetry is not an independent record.
# data/generate_demo_data.py injects a fixed precursor
# fingerprint (ROP x0.62, torque x1.55, ECD +0.08, pit -5 bbl)
# within +/-45 m of every event depth it also writes into
# events.csv. Any engine scored against this pair will
# therefore "detect" every event by construction, so a
# detection rate measured here is a tautology of the data
# generator and not a measure of predictive capability.
# verify_circularity() measures the fingerprint empirically
# rather than taking this on trust.
CIRCULARITY_WINDOW_M = 45


def verify_circularity(records, events, well_id):
    """Measure whether the event-depth windows in the
    telemetry carry an injected precursor fingerprint.

    Compares the mean of each parameter inside the event
    window against the same well's baseline outside it. A
    consistent, large depression in ROP with a matching
    rise in torque across every event is the generator's
    signature, not an independent observation.
    """

    if len(records) < 20 or events.empty:

        return {
            "checked": False,
            "reason": "Insufficient telemetry or no events"
        }

    depths = [
        float(r["depth"]) for r in records
    ]

    events_in_well = events[
        events.well_id == well_id
    ]

    if events_in_well.empty:

        return {
            "checked": False,
            "reason": "No events for this well"
        }

    in_window = set()
    near = []

    for _, event in events_in_well.iterrows():

        for depth in depths:

            if abs(
                depth - float(event["depth"])
            ) <= CIRCULARITY_WINDOW_M:

                in_window.add(depth)

    baseline = [
        r for r in records
        if float(r["depth"]) not in in_window
    ]

    if not baseline or not in_window:

        return {
            "checked": False,
            "reason": "Could not separate event window "
                      "from baseline"
        }

    def _mean(rows, key):

        return sum(
            float(r[key]) for r in rows
        ) / len(rows)

    ratios = {}

    for key in ("rop", "torque", "ecd", "pit_volume"):

        base = _mean(baseline, key)

        ratios[key] = (
            round(_mean(
                [r for r in records
                 if float(r["depth"]) in in_window],
                key
            ) / base, 3)
            if base else None
        )

    near.append(ratios)

    return {
        "checked": True,
        "window_m": CIRCULARITY_WINDOW_M,
        "in_window_ratio_to_baseline": ratios,
        "signature_detected": (
            ratios["rop"] is not None
            and ratios["torque"] is not None
            and ratios["rop"] < 0.85
            and ratios["torque"] > 1.2
        ),
        "generator": (
            "data/generate_demo_data.py applies "
            "rop*0.62, torque*1.55, ecd+0.08, pit-5 "
            "within +/-45 m of each event depth it "
            "generates"
        )
    }


def load_well_series(well_id):
    df = pd.read_csv(DATA / "drilling_data.csv")

    series = (
        df[df.well_id == well_id]
        .sort_values("timestamp")
        .to_dict("records")
    )

    return series


def load_events():
    return pd.read_csv(DATA / "events.csv")


def replay_well(
    well_id,
    records,
    events,
    depth_step_m=DEPTH_STEP_M
):
    """Walk the recorded series forward and record the first
    frame at which each alert band is reached."""

    if not records:

        return {
            "well_id": well_id,
            "evaluable": False,
            "reason": "No telemetry recorded for this well"
        }

    wells = pd.read_csv(DATA / "wells.csv")
    match = wells[wells.well_id == well_id]

    if match.empty:

        return {
            "well_id": well_id,
            "evaluable": False,
            "reason": "Well not present in wells.csv"
        }

    formation = match.iloc[0].formation

    well_events = events[events.well_id == well_id]

    trace = []
    first_alert = None
    last_depth = None
    last_timestamp = None

    for index in range(len(records) - 4):

        window = records[index:index + 5]
        result = calculate_risk(window)
        frame = records[index + 4]

        depth = round(float(frame["depth"]), 2)
        last_depth = depth
        last_timestamp = frame.get("timestamp")

        if first_alert is None and (
            result["risk_score"] >= ALERT_THRESHOLD
        ):

            depth_analysis = analyze_depth_risk(
                active_well_id=well_id,
                current_depth=depth,
                radius_m=WINDOW_M
            )

            evidence = hybrid_search(
                query=(
                    f"historical drilling event "
                    f"{formation} {result['event']} "
                    f"mitigation lesson learned"
                ),
                top_k=5,
                formation=formation,
                event_type=result["event"],
                reference_depth=depth,
                depth_window_m=WINDOW_M
            )

            first_alert = {
                "depth": depth,
                "timestamp": last_timestamp,
                "risk_score": result["risk_score"],
                "risk_level": result["risk_level"],
                "predicted_event": result["event"],
                "thresholds_crossed": result[
                    "risk_model"
                ]["thresholds_crossed"],
                "contributors": result["contributors"],
                "supporting_historical_events":
                    depth_analysis["matching_events"],
                "supporting_event_wells": [
                    e["well_id"]
                    for e in depth_analysis["events"]
                ],
                "retrieved_evidence": [
                    {
                        "source": e["metadata"]["source"],
                        "well_id": e["metadata"]["well_id"],
                        "depth": e["metadata"]["depth"],
                        "relevance": e["relevance"]
                    }
                    for e in evidence
                ]
            }

        trace.append({
            "depth": depth,
            "risk_score": result["risk_score"],
            "risk_level": result["risk_level"],
            "thresholds_crossed": result[
                "risk_model"
            ]["thresholds_crossed"]
        })

    # ---------------------------------------------
    # LEAD DISTANCE / LEAD TIME vs known events
    # ---------------------------------------------

    per_event = []

    for _, event in well_events.iterrows():

        event_depth = round(float(event["depth"]), 2)

        # Which alert depth, if any, precedes the event?
        preceding = [
            a for a in trace
            if a["depth"] <= event_depth
            and a["risk_score"] >= ALERT_THRESHOLD
        ]

        alert = preceding[-1] if preceding else None

        lead_distance = (
            round(event_depth - alert["depth"], 2)
            if alert else None
        )

        per_event.append({
            "event_id": event["event_id"],
            "event": event["event"],
            "formation": event["formation"],
            "event_depth": event_depth,
            "severity": event["severity"],
            "alert_depth": (
                alert["depth"] if alert else None
            ),
            "alert_risk_score": (
                alert["risk_score"] if alert else None
            ),
            "alert_risk_level": (
                alert["risk_level"] if alert else None
            ),
            "lead_distance_m": lead_distance,
            "detected_before_event": alert is not None
        })

    detected = [
        e for e in per_event
        if e["detected_before_event"]
    ]

    lead_distances = [
        e["lead_distance_m"] for e in detected
        if e["lead_distance_m"] is not None
    ]

    evaluable = bool(detected)

    return {
        "well_id": well_id,
        "formation": formation,
        "evaluable": evaluable,
        "frames_evaluated": len(trace),
        "depth_range_m": [
            trace[0]["depth"] if trace else None,
            last_depth
        ],
        "alert_threshold": ALERT_THRESHOLD,
        "first_alert": first_alert,
        "known_events": len(per_event),
        "events_detected_before": len(detected),
        "per_event": per_event,
        "circularity": verify_circularity(
            records, events, well_id
        ),
        "lead_distance_m": {
            "values": lead_distances,
            "median": (
                round(statistics.median(lead_distances), 2)
                if lead_distances else None
            ),
            "min": (
                min(lead_distances)
                if lead_distances else None
            ),
            "max": (
                max(lead_distances)
                if lead_distances else None
            )
        },
        "trace": trace
    }


def summarise(replays):
    """Aggregate across wells. Rates are only reported once
    the sample is large enough to mean anything."""

    all_leads = []
    events_total = 0
    events_detected = 0
    wells_evaluable = 0
    wells_total = 0

    for replay in replays:

        wells_total += 1

        if not replay.get("evaluable"):

            continue

        wells_evaluable += 1
        events_total += replay["known_events"]
        events_detected += replay["events_detected_before"]

        all_leads.extend(
            replay["lead_distance_m"]["values"]
        )

    detection_rate = (
        round(events_detected / events_total, 4)
        if events_total else None
    )

    reportable = events_total >= MIN_CASES_FOR_RATE

    # A rate is only meaningful if the labels are independent
    # of the signal being predicted. They are not here.
    circular = any(
        (r.get("circularity") or {}).get(
            "signature_detected"
        )
        for r in replays
    )

    return {
        "wells_replayed": wells_total,
        "wells_with_evaluable_events": wells_evaluable,
        "known_events_total": events_total,
        "known_events_detected_before": events_detected,

        "detection_rate": (
            None if circular else detection_rate
        ),

        "descriptive_detection_rate": detection_rate,

        "detection_rate_note": (
            "WITHHELD. The demonstration telemetry is not an "
            "independent record of the events: "
            "data/generate_demo_data.py injects a fixed "
            "precursor fingerprint within "
            f"+/-{CIRCULARITY_WINDOW_M} m of every event "
            "depth it writes into events.csv. A detection "
            "rate measured against this pair is a tautology "
            "of the generator, not a measure of predictive "
            "capability. The descriptive value is retained "
            "above for transparency only and must not be "
            "quoted as an accuracy."
            if circular
            else (
                "Reported as descriptive only; the sample is "
                f"below the {MIN_CASES_FOR_RATE}-case "
                "threshold for a meaningful rate."
                if not reportable else None
            )
        ),

        "circularity": {
            "detected": circular,
            "consequence": (
                "Every event in the demonstration dataset is "
                "surrounded by a synthetic precursor. Alert "
                "detection against it measures the data "
                "generator, not the risk engine."
            ),
            "required_for_validation": (
                "An independent labelled set: real recorded "
                "telemetry with incident outcomes annotated "
                "by an operator, where precursors are not "
                "injected."
            )
        },

        "median_lead_distance_m": (
            round(statistics.median(all_leads), 2)
            if all_leads else None
        ),
        "min_lead_distance_m": (
            min(all_leads) if all_leads else None
        ),
        "max_lead_distance_m": (
            max(all_leads) if all_leads else None
        ),

        "lead_time_minutes": None,
        "lead_time_note": (
            "Not reported. The demonstration event table "
            "records no incident timestamps, so a lead time "
            "cannot be derived without fabrication."
        ),

        "validation_status": (
            "NOT VALIDATED" if circular
            else (
                "DESCRIPTIVE ONLY" if not reportable
                else "PROTOTYPE DESCRIPTIVE"
            )
        ),

        "insufficient_data": (
            not reportable or circular
        ),
        "insufficient_data_reason": (
            (
                f"Only {events_total} known event(s) are "
                f"available, they are synthetic, and the "
                f"telemetry carries an injected precursor at "
                f"every event depth. A defensible detection "
                f"rate needs an independent labelled set of "
                f"at least {MIN_CASES_FOR_RATE} real cases."
            )
            if circular
            else (
                f"Only {events_total} known event(s) are "
                f"available and they are synthetic. A "
                f"defensible detection rate needs at least "
                f"{MIN_CASES_FOR_RATE} labelled real cases."
            )
        )
    }


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Historical replay evaluation. Reports only "
            "measured quantities."
        )
    )
    parser.add_argument("--well", default=PRIMARY_WELL)
    parser.add_argument("--all", action="store_true")
    parser.add_argument(
        "--out",
        default=str(RESULTS / "replay.json")
    )
    parser.add_argument(
        "--include-trace",
        action="store_true",
        help="Include the per-frame risk trace"
    )
    args = parser.parse_args()

    events = load_events()
    wells = (
        pd.read_csv(DATA / "wells.csv")
        .well_id.tolist()
        if args.all
        else [args.well]
    )

    replays = []

    for well_id in wells:

        series = load_well_series(well_id)
        replay = replay_well(well_id, series, events)

        if not args.include_trace:

            replay.pop("trace", None)

        replays.append(replay)

        status = (
            "evaluable" if replay.get("evaluable")
            else "not evaluable"
        )

        print(
            f"{well_id}: {status} · "
            f"{replay.get('frames_evaluated', 0)} frames · "
            f"{replay.get('events_detected_before', 0)}"
            f"/{replay.get('known_events', 0)} events "
            f"preceded by an alert"
        )

    _, chunk_count = load_index()

    payload = {
        "evaluation_type": "historical_replay",
        "status": "PROTOTYPE DESCRIPTIVE",
        "validated": False,
        "dataset": {
            "wells_csv": "data/wells.csv",
            "events_csv": "data/events.csv",
            "telemetry_csv": "data/drilling_data.csv",
            "indexed_chunks": len(chunk_count or []),
            "synthetic": True,
            "labelled": False,
            "note": (
                "Every record is synthetic. The event table "
                "is a demonstration fixture, not an "
                "evaluation set, and no ground-truth labels "
                "were created by an operator."
            )
        },
        "method": {
            "description": (
                "Each well's recorded telemetry is replayed "
                "forward in a 5-frame rolling window. The "
                "first frame at which the risk index reaches "
                f"{ALERT_THRESHOLD} is compared against the "
                "depth of every event recorded against that "
                "well."
            ),
            "alert_threshold": ALERT_THRESHOLD,
            "window_records": 5,
            "depth_window_m": WINDOW_M,
            "formula": (
                "lead distance = event depth - alert depth"
            )
        },
        "summary": summarise(replays),
        "replays": replays
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8"
    )

    print(f"\nWritten: {out}")

    summary = payload["summary"]
    print(
        "median lead distance: "
        f"{summary['median_lead_distance_m']} m"
    )
    print(
        "detection rate: "
        f"{summary['detection_rate']}"
    )
    print(
        "validation status: "
        f"{summary['validation_status']}"
    )

    if summary["insufficient_data"]:

        print(
            "\nReplay framework implemented; validation "
            "dataset insufficient for statistically "
            "meaningful results."
        )


if __name__ == "__main__":
    main()
