"""Alert lifecycle.

    DETECTED -> ANALYZING -> CORRELATED -> ALERT
             -> ACKNOWLEDGED -> RESOLVED

State transitions are validated, so a client cannot skip a
stage or move backwards. Timestamps come from the server
clock. In the current prototype the *trigger* is a simulated
stream, so every timestamp in this module is simulation time
and is labelled as such in the payload.

This is a lifecycle *tracker* for the prototype. Alert
persistence, durable audit storage, paging/notification
delivery and operator identity are PRODUCTION PATH items and
are not implemented here.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from threading import Lock


# Canonical order. Index = stage number.
STAGES = [
    "DETECTED",
    "ANALYZING",
    "CORRELATED",
    "ALERT",
    "ACKNOWLEDGED",
    "RESOLVED"
]

STAGE_INDEX = {
    stage: index for index, stage in enumerate(STAGES)
}

# Terminal states cannot be left.
TERMINAL = {"RESOLVED"}

# Only these states may be entered manually by a client.
# A lifecycle still walking the pipeline cannot be
# acknowledged or resolved out of order.
OPERATOR_SETTABLE = {"ACKNOWLEDGED", "RESOLVED"}

MAX_ALERTS = 200

# The prototype has no operator identity provider. The
# acknowledgement actor is an explicit, visible placeholder
# rather than an invented person.
DEFAULT_ACTOR = "unassigned-operator (prototype)"


def _now():
    return datetime.now(timezone.utc)


def _iso(moment):
    return moment.isoformat(timespec="milliseconds")


def _clock(moment):
    return moment.strftime("%H:%M:%S.%f")[:-3]


def transition_error(current, target):
    if current in TERMINAL:

        return (
            f"{current} is a terminal state; "
            f"{target} is not reachable"
        )

    current_index = STAGE_INDEX.get(current)
    target_index = STAGE_INDEX.get(target)

    if target_index is None:

        return f"Unknown lifecycle stage: {target}"

    if target_index <= current_index:

        return (
            f"Cannot move backwards from {current} "
            f"to {target}"
        )

    if target in OPERATOR_SETTABLE and current_index < STAGE_INDEX["ALERT"]:

        return (
            f"{target} requires the alert to have been "
            f"raised; current stage is {current}"
        )

    return None


@dataclass
class Alert:
    id: str
    well_id: str
    depth: float
    formation: str
    title: str
    severity: str
    predicted_event: str
    risk_score: float
    state: str = "DETECTED"
    history: list = field(default_factory=list)

    def to_dict(self):
        payload = asdict(self)
        payload["stage_index"] = STAGE_INDEX.get(
            self.state, 0
        )
        payload["stages"] = STAGES
        payload["is_terminal"] = self.state in TERMINAL
        return payload


class AlertRegistry:
    """In-memory lifecycle tracker.

    Thread-safe, bounded, and explicitly non-persistent:
    restarting the backend clears it, which is stated in the
    payload rather than hidden.
    """

    def __init__(self):
        self._alerts = {}
        self._order = []
        self._lock = Lock()
        self._counter = 0

    # -- helpers ------------------------------------------------

    def _next_id(self):

        self._counter += 1

        return f"ALERT-{self._counter:04d}"

    def _record(self, alert, stage, moment, note, actor=None):

        alert.state = stage
        alert.history.append({
            "stage": stage,
            "at": _iso(moment),
            "clock": _clock(moment),
            "note": note,
            "actor": actor
        })

    def _visible(self, alert, moment):

        return {
            "id": alert.id,
            "state": alert.state,
            "severity": alert.severity,
            "title": alert.title,
            "predicted_event": alert.predicted_event,
            "well_id": alert.well_id,
            "depth": alert.depth,
            "formation": alert.formation,
            "risk_score": alert.risk_score,
            "stage_index": STAGE_INDEX.get(alert.state, 0),
            "stages": STAGES,
            "is_terminal": alert.state in TERMINAL,
            "clock": _clock(moment),
            "lifecycle": alert.history,
            "created_at": (
                alert.history[0]["at"]
                if alert.history else None
            ),
            "resolved_at": next(
                (
                    h["at"] for h in alert.history
                    if h["stage"] == "RESOLVED"
                ),
                None
            ),
            "acknowledged_at": next(
                (
                    h["at"] for h in alert.history
                    if h["stage"] == "ACKNOWLEDGED"
                ),
                None
            )
        }

    # -- lifecycle ----------------------------------------------

    def open_alert(
        self,
        well_id,
        depth,
        formation,
        title,
        severity,
        predicted_event,
        risk_score,
        note="Precursor threshold crossed on the "
             "simulated parameter stream"
    ):

        with self._lock:

            moment = _now()
            alert = Alert(
                id=self._next_id(),
                well_id=well_id,
                depth=depth,
                formation=formation,
                title=title,
                severity=severity,
                predicted_event=predicted_event,
                risk_score=risk_score
            )

            self._record(
                alert, "DETECTED", moment, note
            )
            self._record(
                alert, "ANALYZING", moment,
                "Risk engine contribution breakdown computed"
            )

            self._alerts[alert.id] = alert
            self._order.append(alert.id)

            if len(self._order) > MAX_ALERTS:

                dropped = self._order.pop(0)
                self._alerts.pop(dropped, None)

            return self._visible(alert, moment)

    def correlate(self, alert_id, note):
        """DETECTED/ANALYZING -> CORRELATED -> ALERT."""

        with self._lock:

            alert = self._alerts.get(alert_id)

            if alert is None:

                return None, "Unknown alert"

            moment = _now()

            if alert.state in TERMINAL:

                return None, transition_error(
                    alert.state, "CORRELATED"
                )

            if STAGE_INDEX[alert.state] > STAGE_INDEX["CORRELATED"]:

                return None, (
                    f"{alert_id} is already past CORRELATED "
                    f"({alert.state})"
                )

            if alert.state == "DETECTED":

                self._record(
                    alert, "ANALYZING", moment,
                    "Skipped: correlation requested before "
                    "analysis was recorded"
                )

            self._record(
                alert, "CORRELATED", moment, note
            )
            self._record(
                alert, "ALERT", moment,
                "Alert raised to the operator"
            )

            return self._visible(alert, moment), None

    def set_state(
        self, alert_id, target, note=None, actor=None
    ):

        with self._lock:

            alert = self._alerts.get(alert_id)

            if alert is None:

                return None, "Unknown alert"

            error = transition_error(alert.state, target)

            if error:

                return None, error

            moment = _now()
            resolved_actor = actor or DEFAULT_ACTOR

            if target in OPERATOR_SETTABLE:

                # Resolve implies acknowledgement.
                if (
                    target == "RESOLVED"
                    and alert.state == "ALERT"
                ):

                    self._record(
                        alert, "ACKNOWLEDGED", moment,
                        "Acknowledged implicitly on resolution",
                        resolved_actor
                    )

                self._record(
                    alert, target, moment,
                    note or (
                        "Operator action"
                        if target == "ACKNOWLEDGED"
                        else "Condition cleared"
                    ),
                    resolved_actor
                )

            else:

                self._record(
                    alert, target, moment,
                    note or "Lifecycle stage recorded"
                )

            return self._visible(alert, moment), None

    def get(self, alert_id):

        with self._lock:

            alert = self._alerts.get(alert_id)

            return (
                self._visible(alert, _now())
                if alert else None
            )

    def list(self, well_id=None, limit=50):

        with self._lock:

            ids = (
                list(reversed(self._order))
                if well_id is None
                else [
                    i for i in reversed(self._order)
                    if self._alerts[i].well_id == well_id
                ]
            )

            moment = _now()

            return [
                self._visible(self._alerts[i], moment)
                for i in ids[:limit]
            ]

    def snapshot(self, well_id=None):

        with self._lock:

            moment = _now()

            alerts = [
                self._visible(self._alerts[i], moment)
                for i in reversed(self._order)
            ]

            if well_id:

                alerts = [
                    a for a in alerts
                    if a["well_id"] == well_id
                ]

            counts = {stage: 0 for stage in STAGES}

            for alert in alerts:

                counts[alert["state"]] = (
                    counts.get(alert["state"], 0) + 1
                )

            open_states = [
                a for a in alerts
                if not a["is_terminal"]
            ]

            return {
                "stages": STAGES,
                "alerts": alerts,
                "counts": counts,
                "total": len(alerts),
                "open": len(open_states),
                "clock": _clock(moment),
                "generated_at": _iso(moment),
                "persistence": (
                    "In-memory only — restarting the backend "
                    "clears the lifecycle history. Durable "
                    "storage is a PRODUCTION PATH item."
                ),
                "clock_source": (
                    "Server wall-clock time over a simulated "
                    "parameter stream. All timestamps are "
                    "simulation time, not rig time."
                ),
                "prototype": True
            }

    def clear(self):

        with self._lock:

            self._alerts.clear()
            self._order.clear()
            self._counter = 0


# Single process-wide registry, matching the single-process
# prototype deployment.
REGISTRY = AlertRegistry()
