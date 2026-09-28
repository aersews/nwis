import pandas as pd


def calculate_risk(records):

    if len(records) < 5:
        return {
            "risk_score": 10,
            "risk_level": "LOW",
            "event": "Monitoring",
            "reasons": [
                "Waiting for sufficient drilling data"
            ]
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
        ]
    }


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
            result["signals"]
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
