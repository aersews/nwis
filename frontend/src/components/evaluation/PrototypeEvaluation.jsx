import { useEffect, useState } from "react";

import { api } from "../../lib/api.js";
import { label as fmtLabel, num } from "../../lib/format.js";
import {
  IconCheck,
  IconInfo,
  IconRefresh,
  IconShieldAlert
} from "../common/Icons.jsx";

/**
 * PROTOTYPE EVALUATION & CLAIM AUDIT
 *
 * The panel that shows what was measured and, just as
 * prominently, what was deliberately not measured. A field
 * that reads "Not measured" with a stated reason is a
 * stronger submission position than a number nobody can
 * defend.
 *
 * Everything here is read from the JSON that
 * `python -m evaluation.evaluate` and
 * `python -m evaluation.replay` write. The browser computes
 * nothing.
 */

/* Rendering rules per figure type. A rate of 0.8667 must not
   read as "0.87 of wells" and a count of 0 must not read as
   "0.00 failures". */
const FORMAT = {
  percent: (v) => `${(v * 100).toFixed(1)}%`,
  count: (v) => String(Math.round(v)),
  ms: (v) => num(v, 2),
  metres: (v) => num(v, 2),
  decimal: (v) => num(v, 2),
  bool: (v) => (v ? "Yes" : "No")
};

const DEFAULT_REASON =
  "No labelled dataset in this repository.";

function Metric({
  label,
  value,
  unit,
  reason,
  tone,
  format,
  caveat
}) {
  const measured =
    value !== null && value !== undefined;

  const render = (() => {
    if (typeof value === "boolean") {
      return FORMAT.bool(value);
    }
    if (typeof value !== "number") {
      return String(value);
    }
    const fn = FORMAT[format] ?? FORMAT.decimal;
    return fn(value);
  })();

  return (
    <div
      className="pmetric"
      data-sev={measured ? (tone ?? "low") : "none"}
    >
      <span className="pmetric__label">{label}</span>
      <span className="pmetric__value mono">
        {measured ? (
          <>
            {render}
            {unit ? <small> {unit}</small> : null}
          </>
        ) : (
          "Not measured"
        )}
      </span>
      {measured ? (
        caveat ? (
          <span className="pmetric__caveat">{caveat}</span>
        ) : null
      ) : (
        <span className="pmetric__reason">
          {reason ?? DEFAULT_REASON}
        </span>
      )}
    </div>
  );
}

function Section({ title, children, note }) {
  return (
    <section className="peval__section">
      <div className="peval__section-head">
        <span className="label">{title}</span>
      </div>
      {children}
      {note ? <p className="note">{note}</p> : null}
    </section>
  );
}

export function PrototypeEvaluation() {
  const [evaluation, setEvaluation] = useState({
    status: "loading",
    data: null
  });
  const [audit, setAudit] = useState({
    status: "loading",
    data: null
  });
  const [error, setError] = useState(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setEvaluation({ status: "loading", data: null });
    setAudit({ status: "loading", data: null });
    setError(null);

    Promise.all([
      api.evaluation({ signal: controller.signal }),
      api.claimAudit({ signal: controller.signal })
    ])
      .then(([evalPayload, auditPayload]) => {
        if (cancelled || controller.signal.aborted) return;

        setEvaluation({
          status: evalPayload?.available ? "ready" : "unavailable",
          data: evalPayload?.evaluation ?? null,
          reason: evalPayload?.reason
        });
        setAudit({
          status: auditPayload ? "ready" : "unavailable",
          data: auditPayload ?? null
        });
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        setError(err?.message ?? "Evaluation service unreachable");
        setEvaluation({ status: "error", data: null });
        setAudit({ status: "error", data: null });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token]);

  const retry = () => setToken((t) => t + 1);

  if (error) {
    return (
      <div className="state state--error state--tight" role="alert">
        <span className="state__icon" aria-hidden="true">
          <IconShieldAlert size={16} />
        </span>
        <p className="state__title">Evaluation unavailable</p>
        <p className="state__text">{error}</p>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={retry}
        >
          <IconRefresh size={12} />
          Retry
        </button>
      </div>
    );
  }

  if (evaluation.status === "loading") {
    return (
      <div className="state state--tight state--info">
        <span className="state__icon" aria-hidden="true">
          <IconRefresh size={16} />
        </span>
        <p className="state__text">
          Reading the measured evaluation results…
        </p>
      </div>
    );
  }

  if (evaluation.status === "unavailable") {
    return (
      <div className="state state--tight state--info">
        <span className="state__icon" aria-hidden="true">
          <IconInfo size={16} />
        </span>
        <p className="state__title">Evaluation not yet generated</p>
        <p className="state__text">
          {evaluation.reason ??
            "Run python -m evaluation.evaluate to produce the machine-readable results."}
        </p>
        <code className="peval__cmd">
          python -m evaluation.evaluate
        </code>
      </div>
    );
  }

  const report = evaluation.data;
  const m = report?.measured ?? {};
  const nulls = report?.null_field_reasons ?? {};
  const counts = audit.data?.counts ?? {};
  const replay = m.replay ?? {};

  return (
    <div className="peval">
      <div className="banner banner--info">
        <IconInfo size={14} className="banner__icon" />
        <div className="banner__body">
          <span className="banner__title">
            Validation status:{" "}
            {fmtLabel(report?.validation_status, "NOT VALIDATED")}
          </span>
          <span className="banner__text">
            Every figure below was computed by{" "}
            <code>python -m evaluation.evaluate</code> from the
            data in this repository. A field reading &ldquo;Not
            measured&rdquo; is withheld deliberately, with the
            reason shown — not missing.
          </span>
        </div>
      </div>

      <Section title="Measured on this prototype">
        <div className="pmetrics">
          <Metric
            label="Offset top-1 is NOT the nearest well"
            value={m.offset?.top1_is_not_nearest_rate}
            format="percent"
            tone="low"
          />
          <Metric
            label="Top-1 offset shares the active formation"
            value={m.offset?.top1_shares_formation_rate}
            format="percent"
            tone="low"
          />
          <Metric
            label="Depth-window recall at event depth"
            value={m.depth_correlation?.recall_at_own_depth}
            format="percent"
            tone="low"
            caveat="Definitional, not predictive: the query is issued at each event's own depth, so it is expected to return that event. This measures the correlation rule, not accuracy."
          />
          <Metric
            label="Risk index deterministic on re-score"
            value={m.risk_engine?.deterministic ?? null}
            format="bool"
            tone="low"
          />
          <Metric
            label="Contributor reconciliation failures"
            value={
              m.risk_engine?.contributor_reconciliation
                ?.mismatches ?? null
            }
            format="count"
            unit={`of ${num(
              m.risk_engine?.contributor_reconciliation
                ?.windows_checked ?? 0,
              0
            )} windows`}
            tone="low"
          />
          <Metric
            label="Median API latency"
            value={m.api_latency?.median_ms ?? null}
            format="ms"
            unit="ms"
            tone="low"
          />
          <Metric
            label="Median retrieval latency"
            value={
              m.retrieval?.median_hybrid_latency_ms ?? null
            }
            format="ms"
            unit="ms"
            tone="low"
          />
          <Metric
            label="Median replay lead distance"
            value={replay.median_lead_distance_m ?? null}
            format="metres"
            unit="m"
            tone="low"
          />
        </div>
        <p className="note">
          <IconInfo size={13} className="note__icon" />
          <span>
            {m.offset?.interpretation ??
              "Measured directly against the demonstration dataset."}
          </span>
        </p>
      </Section>

      <Section
        title="Deliberately not measured"
        note="Each of these is null because no independent labelled dataset exists in this repository. Reporting a figure here would measure the synthetic data generator rather than the system."
      >
        <div className="pmetrics">
          <Metric
            label="Alert precision"
            value={report?.alert_precision}
            reason={nulls.alert_precision}
          />
          <Metric
            label="Alert recall"
            value={report?.alert_recall}
            reason={nulls.alert_recall}
          />
          <Metric
            label="False-alarm rate"
            value={report?.false_alarm_rate}
            reason={nulls.false_alarm_rate}
          />
          <Metric
            label="Median lead time"
            value={report?.median_lead_time}
            reason={nulls.median_lead_time}
          />
          <Metric
            label="Offset top-1 relevance"
            value={report?.offset_top1_relevance}
            reason={nulls.offset_top1_relevance}
          />
          <Metric
            label="Risk accuracy (any)"
            value={null}
            reason="No accuracy, precision, recall or F1 figure is claimed anywhere in this system. The risk engine is a fixed-weight rule set, not a validated predictive model."
          />
        </div>
      </Section>

      {replay.circularity ? (
        <Section title="Replay circularity finding">
          <div
            className="banner banner--warn"
            data-sev={replay.circularity.detected ? "medium" : "low"}
          >
            <IconShieldAlert
              size={14}
              className="banner__icon"
            />
            <div className="banner__body">
              <span className="banner__title">
                {replay.circularity.detected
                  ? "Detection rate withheld — the labels are circular"
                  : "No circularity detected"}
              </span>
              <span className="banner__text">
                {replay.circularity.consequence}
              </span>
              <span className="banner__text">
                <strong>To validate:</strong>{" "}
                {replay.circularity.required_for_validation}
              </span>
              {replay.insufficient_data_reason ? (
                <span className="banner__text">
                  {replay.insufficient_data_reason}
                </span>
              ) : null}
            </div>
          </div>
        </Section>
      ) : null}

      {audit.data ? (
        <Section
          title={`Claim audit · ${audit.data.total_claims} claims`}
          note="Every statement this system makes about itself, classified against what the code actually does. Served live from backend/claims.py so the interface, the documentation and the submission cannot drift apart."
        >
          <div className="pcounts">
            {Object.entries(counts).map(([name, value]) => (
              <span
                className="pcount"
                key={name}
                data-sev={
                  name === "NOT VALIDATED"
                    ? "medium"
                    : name === "PRODUCTION PATH"
                      ? "info"
                      : name === "MEASURED"
                        ? "low"
                        : "none"
                }
              >
                <b className="mono">{value}</b>
                <span>{name}</span>
              </span>
            ))}
          </div>
        </Section>
      ) : null}

      {report?.production_validation_path ? (
        <Section
          title="Production validation path"
          note="This is the plan to reach a calibrated, validated model. It is not implemented, and nothing in this system should be read as if it were."
        >
          <ol className="ppath">
            {report.production_validation_path.map(
              (step, index) => (
                <li key={step}>
                  <span className="ppath__index mono">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{step}</span>
                </li>
              )
            )}
          </ol>
        </Section>
      ) : null}

      <p className="note">
        <IconCheck size={13} className="note__icon" />
        <span>
          Full machine-readable results:{" "}
          <span className="mono">evaluation/results/evaluation.json</span>{" "}
          and{" "}
          <span className="mono">evaluation/results/replay.json</span>.
          Reproduce with{" "}
          <span className="mono">
            python -m evaluation.evaluate &amp;&amp; python -m
            evaluation.replay --all
          </span>
          .
        </span>
      </p>
    </div>
  );
}

export default PrototypeEvaluation;
