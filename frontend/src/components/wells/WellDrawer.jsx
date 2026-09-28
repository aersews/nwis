import { useEffect, useMemo, useState } from "react";

import { Drawer } from "../common/Drawer.jsx";
import { Badge } from "../common/Badge.jsx";
import { EmptyState, LoadingState } from "../common/States.jsx";
import { api } from "../../lib/api.js";
import { similarityTier } from "../../lib/risk.js";
import {
  NOT_AVAILABLE,
  isNum,
  km,
  label as fmtLabel,
  num,
  percent
} from "../../lib/format.js";
import {
  IconCompare,
  IconFile,
  IconHistory,
  IconInfo,
  IconRoute
} from "../common/Icons.jsx";

const WINDOW = 50;

function Section({ icon, title, children }) {
  return (
    <section className="drawer__section">
      <div className="drawer__section-head">
        {icon}
        <span className="label">{title}</span>
      </div>
      {children}
    </section>
  );
}

/**
 * Contextual intelligence for one offset well: geometry,
 * similarity, the structured event log, the documents that
 * reference it, and an explicit cross-check between the two
 * stores so a mismatch is visible rather than hidden.
 */
export function WellDrawer({
  well,
  open,
  onClose,
  onCompare,
  currentDepth,
  currentFormation,
  wellRecord,
  documents,
  onViewSource
}) {
  const [events, setEvents] = useState({ status: "idle", rows: [] });

  const wellId = well?.well_id ?? null;

  useEffect(() => {
    if (!open || !wellId) return undefined;

    const controller = new AbortController();
    setEvents({ status: "loading", rows: [] });

    api
      .wellEvents(wellId)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setEvents({ status: "ready", rows: Array.isArray(rows) ? rows : [] });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setEvents({ status: "error", rows: [] });
      });

    return () => controller.abort();
  }, [open, wellId]);

  const wellDocuments = useMemo(
    () =>
      (documents?.sources ?? []).filter(
        (source) => source.well_id === wellId
      ),
    [documents, wellId]
  );

  const inWindow = useMemo(
    () =>
      events.rows.filter(
        (event) =>
          isNum(event.depth) &&
          isNum(currentDepth) &&
          Math.abs(event.depth - currentDepth) <= WINDOW
      ),
    [events.rows, currentDepth]
  );

  const formationEvents = useMemo(
    () => events.rows.filter((event) => event.formation === currentFormation),
    [events.rows, currentFormation]
  );

  /* The demonstration dataset keeps the structured event log and
     the narrative documents in separate stores. If they describe
     different incidents for the same well, say so. */
  const crossCheck = useMemo(() => {
    const docEvents = new Set(
      wellDocuments
        .map((doc) => `${doc.event}|${doc.depth}`)
        .filter((key) => !key.startsWith("UNKNOWN|"))
    );
    const logEvents = new Set(
      events.rows.map((event) => `${event.event}|${Math.round(event.depth)}`)
    );

    const onlyDocuments = Array.from(docEvents).filter(
      (key) => !logEvents.has(key)
    );
    const onlyLog = Array.from(logEvents).filter(
      (key) => !docEvents.has(key)
    );

    if (onlyDocuments.length === 0 && onlyLog.length === 0) return null;

    return { onlyDocuments, onlyLog };
  }, [wellDocuments, events.rows]);

  const tier = similarityTier(well?.similarity_score);

  return (
    <Drawer
      open={open && Boolean(well)}
      onClose={onClose}
      eyebrow="Offset well intelligence"
      severity={similarityTier(well?.similarity_score).key === "strong" ? "medium" : "info"}
      title={fmtLabel(wellId, "—")}
      labelId="well-drawer-title"
      badges={
        <>
          <Badge severity="info" dot={false}>
            {percent(well?.similarity_score, 1)} similar
          </Badge>
          <Badge severity="none" dot={false}>
            {km(well?.distance_km)}
          </Badge>
          <Badge severity="none" dot={false}>
            {tier.label}
          </Badge>
          {inWindow.length > 0 ? (
            <Badge severity="critical" pulse>
              Event inside current window
            </Badge>
          ) : null}
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onCompare?.(well)}
            disabled={!well}
          >
            <IconCompare size={13} />
            Compare with active well
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <Section icon={<IconRoute size={13} style={{ color: "var(--info)" }} />} title="Geometry & similarity">
        <div className="kv">
          <div className="kv__cell">
            <span className="kv__label">Distance</span>
            <span className="kv__value">{km(well?.distance_km)}</span>
          </div>
          <div className="kv__cell">
            <span className="kv__label">Similarity</span>
            <span className="kv__value">
              {percent(well?.similarity_score, 1)}
            </span>
          </div>
          <div className="kv__cell">
            <span className="kv__label">Formation</span>
            <span className="kv__value">{fmtLabel(well?.formation)}</span>
          </div>
          <div className="kv__cell">
            <span className="kv__label">Trajectory</span>
            <span className="kv__value">{fmtLabel(well?.trajectory)}</span>
          </div>
          <div className="kv__cell">
            <span className="kv__label">Hole section</span>
            <span className="kv__value">{fmtLabel(well?.hole_section)}</span>
          </div>
          <div className="kv__cell">
            <span className="kv__label">Total depth</span>
            <span className="kv__value">
              {isNum(wellRecord?.total_depth)
                ? `${num(wellRecord.total_depth, 0)} m`
                : NOT_AVAILABLE}
            </span>
          </div>
        </div>
        <p className="note">
          <IconInfo size={13} className="note__icon" />
          <span>
            No directional survey is present in the dataset, so a 2D
            trajectory cannot be drawn. The profile class above is the
            only trajectory attribute recorded.
          </span>
        </p>
      </Section>

      <Section icon={<IconHistory size={13} style={{ color: "var(--warn)" }} />} title={`Structured event log · ${events.rows.length}`}>
        {events.status === "loading" ? (
          <LoadingState label="Loading event log…" />
        ) : null}

        {events.status === "error" ? (
          <EmptyState
            compact
            severity="critical"
            title="Event log unavailable"
            message="The event table for this well could not be retrieved."
          />
        ) : null}

        {events.status === "ready" && events.rows.length === 0 ? (
          <EmptyState
            compact
            severity="low"
            title="No recorded events"
            message={`No incident is logged against ${fmtLabel(wellId)} in the event table.`}
          />
        ) : null}

        {events.status === "ready" && events.rows.length > 0 ? (
          <div className="deflist">
            {events.rows.map((event) => {
              const delta = isNum(event.depth)
                ? Math.abs(event.depth - (currentDepth ?? event.depth))
                : null;
              const within = delta !== null && delta <= WINDOW;
              return (
                <div
                  className="deflist__row"
                  key={event.event_id ?? `${event.depth}-${event.event}`}
                >
                  <span className="deflist__key">
                    {fmtLabel(event.event)} · {fmtLabel(event.severity)}
                    {within ? (
                      <span style={{ color: "var(--crit)", marginLeft: 6 }}>
                        in window
                      </span>
                    ) : null}
                  </span>
                  <span className="deflist__val">
                    {num(event.depth, 0)} m
                    {delta !== null ? ` (−${num(delta, 0)} m)` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {formationEvents.length > 0 ? (
          <p className="note">
            <IconInfo size={13} className="note__icon" />
            <span>
              {formationEvents.length} of these occurred in{" "}
              {fmtLabel(currentFormation)}. Similarity is computed on
              formation, geometry, hole section, total depth and event
              density.
            </span>
          </p>
        ) : null}
      </Section>

      <Section icon={<IconFile size={13} style={{ color: "var(--info)" }} />} title={`Documents referencing this well · ${wellDocuments.length}`}>
        {wellDocuments.length === 0 ? (
          <EmptyState
            compact
            severity="info"
            title="No indexed documents"
            message={`No chunk in the vector index references ${fmtLabel(wellId)}.`}
          />
        ) : (
          <div className="pill-row">
            {wellDocuments.map((doc) => (
              <button
                key={doc.source}
                type="button"
                className="btn btn--sm"
                onClick={() => onViewSource?.(doc.source)}
              >
                {fmtLabel(doc.source)}
                {isNum(doc.depth) ? ` · ${num(doc.depth, 0)} m` : ""}
              </button>
            ))}
          </div>
        )}
      </Section>

      {crossCheck ? (
        <div className="banner banner--info">
          <IconInfo size={14} className="banner__icon" />
          <div className="banner__body">
            <span className="banner__title">Store cross-check</span>
            <span className="banner__text">
              The demonstration dataset keeps the structured event log and
              the narrative documents apart, and for this well they do not
              describe the same incident. Documents record{" "}
              {crossCheck.onlyDocuments.join(", ") || "nothing new"}; the
              event log records {crossCheck.onlyLog.join(", ") || "nothing new"}.
              Both are shown verbatim rather than reconciled.
            </span>
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

export default WellDrawer;
