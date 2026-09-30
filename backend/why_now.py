"""Why-now explanation layer.

Every field below is derived from values the engines actually
produced: the signal deltas come from ``ml.risk_engine``, the
historical context comes from ``ml.offset_similarity`` and the
convergence sentence is assembled from those same numbers.

Nothing here estimates a probability, forecasts an outcome or
asserts that a historical event will repeat. If an input is
missing the corresponding field is ``None`` and the panel
reports it as unavailable.
"""

from ml.offset_similarity import analyze_depth_risk


# Direction arrows used by the interface. Determined by the
# sign of the measured change, never by the risk model.
DIRECTION = {
    "up": "↑",
    "down": "↓",
    "flat": "→"
}

SIGNAL_UNITS = {
    "rop": "m/hr",
    "torque": "kN·m",
    "ecd": "sg",
    "pit_volume": "bbl"
}

SIGNAL_NAMES = {
    "rop": "ROP",
    "torque": "Torque",
    "ecd": "ECD",
    "pit_volume": "Pit volume"
}

# Which direction is adverse for each parameter. Mirrors
# ml.risk_engine.RISK_MODEL.
ADVERSE = {
    "rop": "down",
    "torque": "up",
    "ecd": "up",
    "pit_volume": "down"
}


def _trend(key, baseline, current):
    """One signal row: measured values, measured change, and
    whether the change runs in the adverse direction."""

    if (
        baseline is None
        or current is None
    ):

        return {
            "key": key,
            "name": SIGNAL_NAMES.get(key, key),
            "unit": SIGNAL_UNITS.get(key),
            "baseline": None,
            "current": None,
            "change": None,
            "change_pct": None,
            "direction": None,
            "adverse": None,
            "available": False
        }

    change = current - baseline

    change_pct = (
        None if baseline == 0
        else round(change / abs(baseline) * 100, 1)
    )

    if abs(change) < 1e-9:

        direction = "flat"

    else:

        direction = "up" if change > 0 else "down"

    adverse = (
        direction == ADVERSE.get(key)
        and direction != "flat"
    )

    return {
        "key": key,
        "name": SIGNAL_NAMES.get(key, key),
        "unit": SIGNAL_UNITS.get(key),
        "baseline": round(baseline, 3),
        "current": round(current, 3),
        "change": round(change, 3),
        "change_pct": change_pct,
        "direction": direction,
        "arrow": DIRECTION[direction],
        "adverse": adverse,
        "available": True
    }


def build_why_now(
    active_well_id,
    current_depth,
    baseline_signals,
    current_signals,
    window_m=50,
    signal_source="demonstration precursor record"
):
    """Assemble the WHY NOW payload.

    baseline_signals / current_signals are the first and last
    frames of the engine's rolling window, so the reported
    change is exactly the change the risk engine scored.
    """

    depth_analysis = analyze_depth_risk(
        active_well_id=active_well_id,
        current_depth=current_depth,
        radius_m=window_m
    )

    events = depth_analysis["events"]

    signals = [
        _trend(
            key,
            (baseline_signals or {}).get(key),
            (current_signals or {}).get(key)
        )
        for key in ("rop", "torque", "ecd", "pit_volume")
    ]

    adverse_signals = [s for s in signals if s["adverse"]]

    nearest = None

    if events:

        nearest = min(
            events,
            key=lambda e: e["depth_difference"]
        )

    # ---------------------------------------------
    # CONVERGENCE SENTENCE
    #
    # Assembled only from counts that were measured. Each
    # clause is guarded so an absent measurement removes
    # the clause rather than substituting a default.
    # ---------------------------------------------

    clauses = []

    if adverse_signals:

        names = ", ".join(
            f"{s['name']} {s['arrow']} "
            f"{abs(s['change_pct']):.0f}%"
            for s in adverse_signals
        )

        clauses.append(
            f"{len(adverse_signals)} of "
            f"{len(signals)} tracked parameters are "
            f"moving adversely ({names})"
        )

    if events:

        window_label = f"±{depth_analysis['search_window_m']} m"

        plural = "" if len(events) == 1 else "s"

        clauses.append(
            f"{len(events)} historical event{plural} of "
            f"the same formation "
            f"{'sits' if len(events) == 1 else 'sit'} "
            f"within {window_label} of the current bit depth"
        )

        if nearest:

            clauses.append(
                f"the closest is {nearest['well_id']} "
                f"{nearest['event']} at "
                f"{nearest['historical_depth']:.0f} m, "
                f"{nearest['depth_difference']:.0f} m "
                f"from the bit"
            )

    if clauses:

        # Clauses are joined so the sentence reads as one
        # statement; a leading clause stays lowercase
        # because the "NWIS detected convergence:" prefix
        # already carries the verb.
        summary = (
            "NWIS detected convergence between current "
            "drilling behaviour and historical offset-well "
            "experience: "
            + "; ".join(clauses)
            + "."
        )

        convergence = True

    else:

        summary = (
            "No convergence is currently asserted. No tracked "
            "parameter is moving adversely and no historical "
            f"event of this formation lies within ±{window_m} m "
            "of the current bit depth."
        )

        convergence = False

    return {
        "well_id": active_well_id,
        "current_depth": current_depth,
        "formation": depth_analysis["formation"],

        "signals": signals,
        "adverse_signal_count": len(adverse_signals),

        "historical": {
            "count": depth_analysis["matching_events"],
            "window_m": depth_analysis["search_window_m"],
            "event_counts": depth_analysis["event_counts"],
            "nearest": nearest,
            "events": events
        },

        "convergence": convergence,
        "summary": summary,
        "clauses": clauses,

        "signal_source": signal_source,

        "interpretation": {
            "risk_index": (
                "An explainable 0-100 index built from "
                "weighted parameter trends. Not a "
                "probability of failure."
            ),
            "convergence": (
                "A descriptive statement that present "
                "behaviour and past recorded experience are "
                "describing the same interval. It is not a "
                "prediction that the event will recur."
            ),
            "evidence": (
                "Historical records come from the "
                "demonstration event table and narrative "
                "documents. They are synthetic."
            )
        },

        "correlation": depth_analysis["correlation"]
    }
