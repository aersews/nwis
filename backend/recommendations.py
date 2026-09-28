def generate_recommendation(
    risk_event,
    evidence
):

    if not evidence:

        return {
            "recommendation":
                "Continue monitoring current drilling parameters.",
            "confidence":
                "LOW",
            "basis":
                "No relevant historical evidence found."
        }

    event = risk_event.lower()

    if "stuck" in event:

        recommendation = (
            "Increase monitoring of torque and "
            "drilling performance. Consider controlled "
            "circulation, pipe movement and backreaming "
            "procedures according to field operating "
            "practice if precursor trends continue."
        )

    elif "loss" in event:

        recommendation = (
            "Monitor pit volume, flow behaviour and "
            "ECD closely. Consider controlled flow "
            "adjustment and lost-circulation mitigation "
            "procedures according to the approved "
            "drilling program."
        )

    elif "kick" in event:

        recommendation = (
            "Closely monitor flow-out, pit volume and "
            "pressure indicators and follow the approved "
            "well-control procedure if abnormal trends "
            "persist."
        )

    else:

        recommendation = (
            "Continue enhanced monitoring and compare "
            "current behaviour against historical offset "
            "well evidence."
        )

    return {

        "recommendation":
            recommendation,

        "confidence":
            "MEDIUM",

        "evidence_count":
            len(evidence),

        "basis":
            "Historical offset-well evidence"

    }
