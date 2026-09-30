import pandas as pd


# =========================================================
# RISK MODEL DEFINITION
#
# One table, used by calculate_risk() and read back by the
# API so the interface can never disagree with the engine.
#
# `weight` is the share of the 0-100 index a signal can
# contribute; `saturation` is the adverse change at which
# that signal's term reaches 1.0.
# =========================================================

RISK_MODEL = {
    "version": "rules-v1",
    "type": "Weighted trend heuristics",
    "calibrated": False,
    "is_probability": False,
    "window": "Last 5 records (min 5 required)",
    "signals": [
        {
            "key": "rop",
            "label": "ROP decline",
            "unit": "%",
            "weight": 0.35,
            "saturation": 0.30,
            "adverse": "down",
            "threshold": 0.20,
            "threshold_text": (
                "ROP drop above 20% across the window"
            )
        },
        {
            "key": "torque",
            "label": "Torque increase",
            "unit": "%",
            "weight": 0.25,
            "saturation": 0.50,
            "adverse": "up",
            "threshold": 0.15,
            "threshold_text": (
                "Torque rise above 15% across the window"
            )
        },
        {
            "key": "ecd",
            "label": "ECD increase",
            "unit": "sg",
            "weight": 0.25,
            "saturation": 0.10,
            "adverse": "up",
            "threshold": 0.03,
            "threshold_text": (
                "ECD rise above 0.03 sg across the window"
            )
        },
        {
            "key": "pit_volume",
            "label": "Pit-volume decrease",
            "unit": "%",
            "weight": 0.15,
            "saturation": 0.08,
            "adverse": "down",
            "threshold": 0.03,
            "threshold_text": (
                "Pit-volume drop above 3% across the window"
            )
        }
    ]
}


def _r(value, digits=1):
    return round(float(value), digits)


def _contributor(spec, observed):
    """One additive contribution to the 0-100 risk index.

    points = weight x normalised adverse change x 100.
    normalised is clamped to 1.0 at the saturation point, so
    the four contributions always sum to the reported score.

    `observed` is the raw adverse change as a ratio; the
    reported `observed` field carries the same quantity in
    the signal's own unit (% or sg) so a reader never has to
    convert it.
    """

    normalised = min(
        max(observed / spec["saturation"], 0.0),
        1.0
    )

    crossed = observed > spec["threshold"]

    is_percent = spec["unit"] == "%"

    observed_in_unit = (
        observed * 100 if is_percent else observed
    )

    saturation_in_unit = (
        spec["saturation"] * 100
        if is_percent else spec["saturation"]
    )

    def _fmt(value):
        if is_percent:
            return f"{value:.0f}%"
        return f"{value:.2f} sg"

    return {
        "key": spec["key"],
        "label": spec["label"],
        "weight": spec["weight"],
        "saturation": _r(spec["saturation"], 3),
        "saturation_in_unit": _r(saturation_in_unit, 3),
        "unit": spec["unit"],
        "observed": _r(observed_in_unit, 3),
        "observed_ratio": _r(observed, 4),
        "normalised": _r(normalised, 3),
        "points_exact": spec["weight"] * normalised * 100,
        "points": _r(spec["weight"] * normalised * 100, 1),
        "max_points": _r(spec["weight"] * 100, 1),
        "threshold_crossed": crossed,
        "threshold": _r(spec["threshold"], 3),
        "threshold_text": spec["threshold_text"],
        "at_saturation": normalised >= 1.0,
        "detail": (
            f"{spec['label']}: observed "
            f"{_fmt(observed_in_unit)} "
            f"against a saturation point of "
            f"{_fmt(saturation_in_unit)} "
            f"→ {spec['weight'] * normalised * 100:.1f} of "
            f"{spec['weight'] * 100:.0f} points"
        )
    }


def _reconcile(contributors, target):
    """Force the rounded contributions to add up to the
    reported score.

    Rounding each contribution to one decimal and then
    summing can differ from rounding the total by up to
    0.2 points. On a dashboard that is the difference
    between "the bars add up to the number above" and "they
    do not".

    The residual is absorbed by the contribution with the
    largest truncated remainder (largest-remainder
    allocation), so no individual value is distorted by more
    than a tenth of a point and the identity
    ``sum(points) == score`` always holds.
    """

    rounded_total = round(
        sum(c["points"] for c in contributors), 1
    )

    residual = round(target - rounded_total, 1)

    if abs(residual) < 1e-9 or not contributors:

        return rounded_total

    order = sorted(
        range(len(contributors)),
        key=lambda i: (
            abs(
                contributors[i]["points_exact"]
                - contributors[i]["points"]
            )
        ),
        reverse=True
    )

    index = order[0]

    contributors[index]["points"] = _r(
        contributors[index]["points"] + residual, 1
    )

    return round(
        sum(c["points"] for c in contributors), 1
    )


def calculate_risk(records):

    if len(records) < 5:
        return {
            "risk_score": 10,
            "risk_level": "LOW",
            "event": "Monitoring",
            "reasons": [
                "Waiting for sufficient drilling data"
            ],
            "signals": {},
            "contributors": [],
            "contributors_total": 0.0,
            "risk_model": {
                **RISK_MODEL,
                "status": "Insufficient data — fewer "
                          "than 5 records in the window"
            }
        }

    df = pd.DataFrame(records).tail(5)

    # -----------------------------
    # ROP TREND
    # -----------------------------

    initial_rop = max(
        float(df.rop.iloc[0]),
        1
    )

    final_rop = float(df.rop.iloc[-1])

    rop_drop = max(
        0,
        1 - final_rop / initial_rop
    )

    # -----------------------------
    # TORQUE TREND
    # -----------------------------

    initial_torque = max(
        float(df.torque.iloc[0]),
        1
    )

    final_torque = float(
        df.torque.iloc[-1]
    )

    torque_rise = max(
        0,
        final_torque / initial_torque - 1
    )

    # -----------------------------
    # ECD TREND
    # -----------------------------

    initial_ecd = float(
        df.ecd.iloc[0]
    )

    final_ecd = float(
        df.ecd.iloc[-1]
    )

    ecd_rise = max(
        0,
        final_ecd - initial_ecd
    )

    # -----------------------------
    # PIT VOLUME
    # -----------------------------

    initial_pit = max(
        float(df.pit_volume.iloc[0]),
        1
    )

    final_pit = float(
        df.pit_volume.iloc[-1]
    )

    pit_drop = max(
        0,
        (initial_pit - final_pit)
        / initial_pit
    )

    # -----------------------------
    # RISK CONTRIBUTIONS
    # -----------------------------

    rop_signal = min(
        rop_drop / 0.30,
        1
    )

    torque_signal = min(
        torque_rise / 0.50,
        1
    )

    ecd_signal = min(
        ecd_rise / 0.10,
        1
    )

    pit_signal = min(
        pit_drop / 0.08,
        1
    )

    # -----------------------------
    # COMBINED RISK
    # -----------------------------

    risk = 100 * (
        0.35 * rop_signal
        + 0.25 * torque_signal
        + 0.25 * ecd_signal
        + 0.15 * pit_signal
    )

    risk = min(
        max(risk, 0),
        100
    )

    # -----------------------------
    # CONTRIBUTION BREAKDOWN
    #
    # Additive decomposition of the score above, using the
    # same weights and saturation points. The four points
    # values sum to `risk`; this is arithmetic, not a
    # second model.
    # -----------------------------

    specs = {
        spec["key"]: spec
        for spec in RISK_MODEL["signals"]
    }

    contributors = [
        _contributor(specs["rop"], rop_drop),
        _contributor(specs["torque"], torque_rise),
        _contributor(specs["ecd"], ecd_rise),
        _contributor(specs["pit_volume"], pit_drop)
    ]

    contributors_total = _reconcile(
        contributors, risk
    )

    # -----------------------------
    # EXPLANATION
    # -----------------------------

    reasons = []

    if rop_drop > 0.20:
        reasons.append(
            "ROP decreasing significantly"
        )

    if torque_rise > 0.15:
        reasons.append(
            "Torque increasing"
        )

    if ecd_rise > 0.03:
        reasons.append(
            "ECD increasing"
        )

    if pit_drop > 0.03:
        reasons.append(
            "Pit-volume decrease detected"
        )

    # -----------------------------
    # RISK LEVEL
    # -----------------------------

    if risk >= 75:

        level = "CRITICAL"

    elif risk >= 55:

        level = "HIGH"

    elif risk >= 30:

        level = "MEDIUM"

    else:

        level = "LOW"

    event = (
        "Potential Lost Circulation"
        if risk >= 55
        else "Monitoring"
    )

    return {

        "risk_score": round(
            risk,
            1
        ),

        "risk_level": level,

        "event": event,

        "signals": {

            "rop_drop": round(
                rop_drop * 100,
                1
            ),

            "torque_rise": round(
                torque_rise * 100,
                1
            ),

            "ecd_rise": round(
                ecd_rise,
                3
            ),

            "pit_drop": round(
                pit_drop * 100,
                1
            )
        },

        "reasons": reasons
        or [
            "No significant precursor detected"
        ],

        # ---- explainability layer (additive) ----

        "contributors": contributors,

        "contributors_total": contributors_total,

        "risk_model": {
            **RISK_MODEL,
            "status": "Scored",
            "records_used": int(len(df)),
            "thresholds_crossed": sum(
                1 for c in contributors
                if c["threshold_crossed"]
            )
        }
    }


def build_contributors(
    risk_result,
    historical_bonus=0
):
    """Full additive breakdown of a *contextual* index.

    calculate_risk() decomposes the signal index. The
    contextual index additionally carries the historical
    corroboration bonus applied by the API, so that bonus has
    to appear as a named contribution here — otherwise the
    bars on the panel would not add up to the number above
    them.

    Returns (contributors, total, reconciles).
    """

    contributors = list(
        risk_result.get("contributors", [])
    )

    if historical_bonus > 0:

        contributors.append({
            "key": "historical",
            "label": "Historical corroboration",
            "weight": None,
            "saturation": 15,
            "unit": "pts",
            "observed": _r(historical_bonus, 1),
            "observed_ratio": None,
            "normalised": _r(historical_bonus / 15, 3),
            "points": _r(historical_bonus, 1),
            "points_exact": float(historical_bonus),
            "max_points": 15,
            "threshold_crossed": True,
            "threshold": None,
            "threshold_text": (
                "+3 points per historical event inside the "
                "depth window, capped at +15"
            ),
            "at_saturation": historical_bonus >= 15,
            "detail": (
                f"Historical corroboration: "
                f"{round(historical_bonus / 3)} event(s) "
                f"inside the depth window "
                f"→ +{historical_bonus} of 15 points"
            )
        })

    signal_total = risk_result.get("risk_score", 0)

    target = min(
        signal_total + historical_bonus, 100
    )

    total = _reconcile(contributors, target)

    return contributors, total, abs(total - target) < 0.11


def contextual_level(score):

    if score >= 75:

        return "CRITICAL"

    if score >= 55:

        return "HIGH"

    if score >= 30:

        return "MEDIUM"

    return "LOW"


def risk_score(records):
    """
    Backward-compatible wrapper.
    """

    result = calculate_risk(
        records
    )

    return {

        "risk": result["risk_score"],

        "event": result["event"],

        "reasons": result["reasons"],

        "risk_level":
            result["risk_level"],

        "signals":
            result["signals"],

        "contributors":
            result.get("contributors", []),

        "contributors_total":
            result.get("contributors_total", 0.0),

        "risk_model":
            result.get("risk_model", RISK_MODEL)
    }


def simulate_live(
    df,
    active_well="WELL-001"
):

    records = (

        df[
            df.well_id == active_well
        ]

        .sort_values(
            "timestamp"
        )

        .to_dict(
            "records"
        )
    )

    return records
