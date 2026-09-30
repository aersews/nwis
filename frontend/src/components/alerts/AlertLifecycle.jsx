import { useCallback, useState } from "react";

import { api } from "../../lib/api.js";
import {
  isNum,
  label as fmtLabel,
  num
} from "../../lib/format.js";
import { severityKey } from "../../lib/risk.js";
import { IconCheck, IconLifecycle, IconInfo } from "../common/Icons.jsx";

/**
 * ALERT LIFECYCLE
 *
 *   DETECTED → ANALYZING → CORRELATED → ALERT
 *            → ACKNOWLEDGED → RESOLVED
 *
 * The first four stages are recorded by the backend as the
 * alert is built. Acknowledgement and resolution are
 * operator actions, sent to POST /api/alerts/{id}/state and
 * validated server-side — the buttons below are disabled for
 * any transition the API would reject, so the interface never
 * offers a move the lifecycle cannot make.
 */
export function AlertLifecycle({
  lifecycle,
  contextual,
  onChanged
}) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [local, setLocal] = useState(null);

  const data = local ?? lifecycle ?? null;
  const tracked = data?.tracked ?? null;

  /* The rule hypothesis and the dominant historical event are
     produced by different parts of the system and can name
     different things. Both are shown rather than merged. */
  const historicalCount =
    contextual?.historical_event_count ?? 0;

  const historicalEvent =
    contextual?.why_now?.historical?.nearest ?? null;

  const stages = data?.stages ?? [
    "DETECTED",
    "ANALYZING",
    "CORRELATED",
    "ALERT",
    "ACKNOWLEDGED",
    "RESOLVED"
  ];

  const act = useCallback(
    async (stage) => {
      if (!tracked) return;

      setPending(stage);
      setError(null);

      try {
        const result = await api.alertState(
          tracked.id,
          stage
        );

        if (result?.alert) {
          setLocal((prev) => ({
            ...(prev ?? {}),
            tracked: result.alert
          }));
        } else {
          setError(
            result?.detail ??
              "The lifecycle rejected this transition"
          );
        }

        onChanged?.(result?.alert ?? null);
      } catch (err) {
        setError(
          err?.message ?? "Could not reach the alert service"
        );
      } finally {
        setPending(null);
      }
    },
    [tracked, onChanged]
  );

  if (!data) {
    return (
      <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
        No alert has been raised at this bit position.
      </p>
    );
  }

  const currentIndex = tracked
    ? stages.indexOf(tracked.state)
    : -1;

  const canAcknowledge =
    tracked &&
    tracked.state === "ALERT" &&
    !tracked.is_terminal;

  const canResolve =
    tracked &&
    ["ALERT", "ACKNOWLEDGED"].includes(tracked.state);

  return (
    <div className="lifecycle">
      {tracked ? (
        <>
          <header className="lifecycle__head">
            <span
              className="lifecycle__id mono"
              title="Alert identifier"
            >
              {tracked.id}
            </span>
            <span
              className="lifecycle__sev"
              data-sev={severityKey(tracked.severity)}
            >
              {fmtLabel(tracked.severity, "—")}
            </span>
            <span className="lifecycle__title">
              {fmtLabel(tracked.title)}
            </span>
            {isNum(tracked.risk_score) ? (
              <span className="lifecycle__score mono">
                {num(tracked.risk_score, 1)} / 100
              </span>
            ) : null}
          </header>

          <ol className="lifecycle__track">
            {stages.map((stage, index) => {
              const reached = index <= currentIndex;
              const active = index === currentIndex;
              const entry = (
                tracked.lifecycle ?? []).find(
                  (h) => h.stage === stage
                );

              return (
                <li
                  key={stage}
                  className={`lstage${reached ? " is-reached" : ""}${
                    active ? " is-active" : ""
                  }`}
                  data-sev={
                    active ? severityKey(tracked.severity) : "none"
                  }
                >
                  <span
                    className="lstage__node"
                    aria-hidden="true"
                  >
                    {reached ? (
                      <IconCheck size={10} />
                    ) : (
                      <i />
                    )}
                  </span>
                  <span className="lstage__name">{stage}</span>
                  <span className="lstage__time mono">
                    {entry?.clock ?? "—"}
                  </span>
                </li>
              );
            })}
          </ol>

          {tracked.predicted_event || historicalEvent ? (
            <div className="lifecycle__events">
              {tracked.predicted_event ? (
                <p className="lifecycle__event">
                  <span className="label">Rule hypothesis</span>{" "}
                  <strong>
                    {fmtLabel(tracked.predicted_event)}
                  </strong>{" "}
                  — produced by the risk engine from the current
                  parameter trends alone.
                </p>
              ) : null}
              {historicalEvent ? (
                <p className="lifecycle__event">
                  <span className="label">
                    Historical context
                  </span>{" "}
                  <strong>
                    {fmtLabel(historicalEvent.event)}
                  </strong>{" "}
                  at {num(historicalEvent.historical_depth, 0)} m in{" "}
                  {fmtLabel(historicalEvent.well_id)} — the
                  dominant event type among the{" "}
                  {historicalCount} record
                  {historicalCount === 1 ? "" : "ed"} inside the
                  depth window.
                </p>
              ) : null}
              {tracked.predicted_event &&
              historicalEvent &&
              tracked.predicted_event !== historicalEvent.event ? (
                <p className="note">
                  <IconInfo size={13} className="note__icon" />
                  <span>
                    The rule hypothesis and the historical
                    context name different events. The engine
                    does not reconcile them: the first comes
                    from the signal rule set, the second from
                    what nearby wells recorded. Both are shown
                    so the disagreement is visible.
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="lifecycle__actions">
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => act("ACKNOWLEDGED")}
              disabled={!canAcknowledge || pending !== null}
              title={
                canAcknowledge
                  ? "Record operator acknowledgement"
                  : "Available once the alert has been raised"
              }
            >
              {pending === "ACKNOWLEDGED"
                ? "Recording…"
                : "Acknowledge"}
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => act("RESOLVED")}
              disabled={!canResolve || pending !== null}
              title={
                canResolve
                  ? "Record that the condition has cleared"
                  : "Available once the alert has been raised"
              }
            >
              {pending === "RESOLVED"
                ? "Recording…"
                : "Resolve"}
            </button>
            {tracked.is_terminal ? (
              <span className="badge badge--plain">
                <IconCheck size={10} />
                Resolved
              </span>
            ) : null}
          </div>

          {error ? (
            <p className="note note--warn" role="alert">
              <IconInfo size={13} className="note__icon" />
              <span>{error}</span>
            </p>
          ) : null}
        </>
      ) : (
        <div className="state state--tight state--info">
          <span className="state__icon" aria-hidden="true">
            <IconLifecycle size={16} />
          </span>
          <p className="state__title">
            No active alert at this bit position
          </p>
          <p className="state__text">
            {data.total > 0
              ? `${data.open} of ${data.total} tracked alert(s) are still open.`
              : "The contextual index is below the alert threshold, so no alert has been raised."}
          </p>
        </div>
      )}

      {data.clock_source ? (
        <p className="note">
          <IconInfo size={13} className="note__icon" />
          <span>
            {data.clock_source} Lifecycle state{" "}
            {data.persistence}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export default AlertLifecycle;
