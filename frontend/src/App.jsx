import { useCallback, useEffect, useMemo, useState } from "react";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/panels.css";
import "./styles/charts.css";
import "./styles/map.css";
import "./styles/explain.css";
import "./styles/overlays.css";

import { TopBar } from "./components/layout/TopBar.jsx";
import { DemoBar } from "./components/layout/DemoBar.jsx";
import { SectionRail } from "./components/layout/SectionRail.jsx";
import { DataProvenance } from "./components/layout/DataProvenance.jsx";

import { Panel } from "./components/common/Panel.jsx";
import { PanelBoundary } from "./components/common/PanelBoundary.jsx";
import {
  ErrorState,
  LoadingState,
  SkeletonRows
} from "./components/common/States.jsx";

import { WellMap } from "./components/map/WellMap.jsx";
import { RiskPanel } from "./components/risk/RiskPanel.jsx";
import { WhyThisAlert } from "./components/risk/WhyThisAlert.jsx";
import { LiveTelemetry } from "./components/telemetry/LiveTelemetry.jsx";
import { AlertTimeline } from "./components/alerts/AlertTimeline.jsx";
import { AlertDetailModal } from "./components/alerts/AlertDetailModal.jsx";
import { AlertLifecycle } from "./components/alerts/AlertLifecycle.jsx";
import { HistoricalIntelligence } from "./components/history/HistoricalIntelligence.jsx";
import { EvidencePanel } from "./components/evidence/EvidencePanel.jsx";
import { DocumentExplorer } from "./components/evidence/DocumentExplorer.jsx";
import { DocumentViewer } from "./components/evidence/DocumentViewer.jsx";
import { RecommendationPanel } from "./components/recommendation/RecommendationPanel.jsx";
import { OffsetExplorer } from "./components/wells/OffsetExplorer.jsx";
import { WellDrawer } from "./components/wells/WellDrawer.jsx";
import { WellComparison } from "./components/wells/WellComparison.jsx";
import { GlobalSearch } from "./components/search/GlobalSearch.jsx";
import { EvidenceChain } from "./components/dashboard/EvidenceChain.jsx";
import { WhyNow } from "./components/why/WhyNow.jsx";
import { PrototypeEvaluation } from "./components/evaluation/PrototypeEvaluation.jsx";

import { useSystemStatus } from "./hooks/useSystemStatus.js";
import { useCatalog } from "./hooks/useCatalog.js";
import { useNwisIntelligence } from "./hooks/useNwisIntelligence.js";
import { useDemoSimulation } from "./hooks/useDemoSimulation.js";
import { useTelemetryStream } from "./hooks/useTelemetryStream.js";
import { useAlertTimeline } from "./hooks/useAlertTimeline.js";
import {
  useActiveSection,
  useScrollToSection
} from "./hooks/index.js";

import { bandForLevel, severityKey } from "./lib/risk.js";
import { isNum, label as fmtLabel, num, timeOfDay } from "./lib/format.js";
import { IconInfo, IconSearch } from "./components/common/Icons.jsx";

const ACTIVE_WELL = "WELL-001";
const DEFAULT_DEPTH = 2840;

const SECTIONS = [
  "sec-map",
  "sec-risk",
  "sec-whynow",
  "sec-why",
  "sec-telemetry",
  "sec-timeline",
  "sec-history",
  "sec-evidence",
  "sec-reco",
  "sec-documents",
  "sec-offsets",
  "sec-lifecycle",
  "sec-evaluation"
];

export default function App() {
  const [telemetrySource, setTelemetrySource] = useState("scenario");
  const [radiusKm, setRadiusKm] = useState(25);
  const [selectedOffset, setSelectedOffset] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [alertEntry, setAlertEntry] = useState(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [documentSource, setDocumentSource] = useState(null);
  const [clock, setClock] = useState(() => timeOfDay());
  const [intelDepth, setIntelDepth] = useState(DEFAULT_DEPTH);

  const systemState = useSystemStatus();
  const catalog = useCatalog();
  const timeline = useAlertTimeline();

  /* ---- demo scenario ---------------------------------------- */

  const onFrame = useCallback(
    (frame) => {
      timeline.recordWarnings(frame?.warnings ?? []);
      if (frame?.risk) {
        timeline.recordLevel(frame.risk.level, frame.risk.score);
      }
      if (isNum(frame?.depth)) {
        setIntelDepth(frame.depth);
      }
    },
    [timeline]
  );

  /* A replayed scenario starts with a clean alert log; keeping the
     previous run's entries would misreport them as current. */
  const demo = useDemoSimulation(ACTIVE_WELL, {
    onFrame,
    onRestart: timeline.clear
  });

  /* With no live frame — first load, or after a restart — the
     contextual read-out returns to the default bit position
     instead of lingering on the last depth of the previous run. */
  useEffect(() => {
    if (!demo.frame) setIntelDepth(DEFAULT_DEPTH);
  }, [demo.frame]);

  /* ---- unified intelligence --------------------------------- */

  const intel = useNwisIntelligence(ACTIVE_WELL, intelDepth);

  /* ---- telemetry socket (only while the replay is selected) - */

  const stream = useTelemetryStream(ACTIVE_WELL, {
    enabled: telemetrySource === "replay"
  });
  const { points: streamPoints } = stream;

  const liveFrame = useMemo(() => {
    if (telemetrySource === "replay") {
      const last = streamPoints[streamPoints.length - 1];
      if (!last) return null;
      return {
        depth: last.depth,
        formation: intel.data?.well?.formation ?? null,
        signals: {
          rop: last.rop,
          torque: last.torque,
          ecd: last.ecd,
          pit_volume: last.pit_volume
        },
        warnings: last.reasons ?? [],
        risk: { score: last.risk, level: last.riskLevel }
      };
    }
    return demo.frame;
  }, [telemetrySource, streamPoints, demo.frame, intel.data]);

  useEffect(() => {
    const data = intel.data;
    if (!data) return;

    const events = data.historical_events ?? [];
    if (events.length > 0) {
      /* Keyed on the finding, not the depth: re-entering the same
         interval at a new bit position is not a new insight, and a
         timeline that repeats itself stops being readable. */
      timeline.pushOnce(
        `correlation:${events.map((e) => `${e.well_id}:${e.event}`).join(",")}`,
        {
          kind: "correlation",
          severity: "medium",
          title: `Historical match identified — ${events
            .map((e) => `${e.well_id} ${fmtLabel(e.event).toUpperCase()}`)
            .join(", ")}`,
          detail: `Within ±50 m of the bit depth in ${fmtLabel(
            data.well?.formation
          )}`
        }
      );
    }

    const docs = data.document_evidence ?? [];
    if (docs.length > 0) {
      timeline.pushOnce(
        `evidence:${docs.map((d) => d?.metadata?.source).join(",")}`,
        {
          kind: "evidence",
          severity: "info",
          title: `Evidence retrieved — ${docs.length} document${
            docs.length === 1 ? "" : "s"
          }`,
          detail: docs
            .slice(0, 3)
            .map((d) => d?.metadata?.source)
            .filter(Boolean)
            .join(" · ")
        }
      );
    }

    if (data.recommendation?.recommendation) {
      timeline.pushOnce(
        `reco:${data.recommendation.confidence}:${data.recommendation.evidence_count ?? docs.length}`,
        {
          kind: "evidence",
          severity: "low",
          title: "Decision support generated",
          detail: `${data.recommendation.confidence} confidence · ${
            data.recommendation.evidence_count ?? docs.length
          } documents · ${fmtLabel(data.recommendation.basis)}`
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intel.data]);

  useEffect(() => {
    if (demo.frame) return;
    timeline.pushOnce("system:ready", {
      kind: "system",
      severity: "low",
      title: "Contextual intelligence loaded",
      detail: `${ACTIVE_WELL} at ${num(intelDepth, 0)} m — press play to run the scenario`
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intel.data]);

  /* ---- clock ------------------------------------------------ */

  useEffect(() => {
    const timer = setInterval(() => setClock(timeOfDay()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* ---- global keyboard -------------------------------------- */

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---- navigation ------------------------------------------- */

  const activeSection = useActiveSection(SECTIONS);
  const scrollTo = useScrollToSection();
  const go = useCallback((id) => scrollTo(id), [scrollTo]);

  const openWellById = useCallback(
    async (wellId) => {
      const fromOffsets = (intel.data?.offsets ?? []).find(
        (o) => o.well_id === wellId
      );
      if (fromOffsets) {
        setSelectedOffset(fromOffsets);
        setDrawerOpen(true);
        return;
      }
      const fromCatalog = catalog.wells.find((w) => w.well_id === wellId);
      if (fromCatalog) {
        setSelectedOffset({
          well_id: wellId,
          formation: fromCatalog.formation,
          trajectory: fromCatalog.trajectory,
          hole_section: fromCatalog.hole_section,
          distance_km: null,
          similarity_score: null,
          historical_event_count: catalog.eventsForWell(wellId).length,
          historical_events: []
        });
        setDrawerOpen(true);
      }
    },
    [intel.data, catalog]
  );

  useEffect(() => {
    const openWell = (event) => {
      if (event.detail?.wellId) openWellById(event.detail.wellId);
    };
    const openDoc = (event) => {
      if (event.detail?.source) setDocumentSource(event.detail.source);
    };
    window.addEventListener("nwis:open-well", openWell);
    window.addEventListener("nwis:open-document", openDoc);
    return () => {
      window.removeEventListener("nwis:open-well", openWell);
      window.removeEventListener("nwis:open-document", openDoc);
    };
  }, [openWellById]);

  /* ---- derived --------------------------------------------- */

  const correlatedWellIds = useMemo(() => {
    const set = new Set();
    for (const event of intel.data?.historical_events ?? []) {
      if (event?.well_id) set.add(event.well_id);
    }
    return set;
  }, [intel.data]);

  const activeRecord = useMemo(
    () => catalog.wells.find((w) => w.well_id === ACTIVE_WELL) ?? null,
    [catalog.wells]
  );

  const offsetRecord = useMemo(
    () =>
      catalog.wells.find((w) => w.well_id === selectedOffset?.well_id) ?? null,
    [catalog.wells, selectedOffset]
  );

  const riskHistory = useMemo(
    () =>
      (demo.history ?? [])
        .map((frame) => frame?.risk?.score)
        .filter(isNum),
    [demo.history]
  );

  const headlineLevel = liveFrame?.risk?.level ?? intel.data?.risk?.level ?? "LOW";
  const headlineScore = liveFrame?.risk?.score ?? intel.data?.risk?.score ?? null;

  const severityBySection = useMemo(
    () => ({
      "sec-risk": severityKey(headlineLevel),
      "sec-whynow":
        intel.data?.why_now?.convergence
          ? severityKey(headlineLevel)
          : "none",
      "sec-why": severityKey(headlineLevel),
      "sec-history":
        (intel.data?.historical_event_count ?? 0) > 0 ? "medium" : "none",
      "sec-lifecycle": intel.data?.alert?.lifecycle?.tracked
        ? severityKey(headlineLevel)
        : "none",
      "sec-telemetry": demo.running ? "info" : "none"
    }),
    [headlineLevel, intel.data, demo.running]
  );

  /* ---- boot ------------------------------------------------ */

  /* A transient health-check blip must never destroy a live
     dashboard. The offline screen is only for the first contact. */
  const [everConnected, setEverConnected] = useState(false);
  useEffect(() => {
    if (systemState.reachable) setEverConnected(true);
  }, [systemState.reachable]);

  if (!everConnected && !systemState.reachable && systemState.checkedAt === null) {
    return (
      <div className="boot">
        <div className="boot__inner">
          <span className="boot__mark" aria-hidden="true" />
          <h1 className="boot__title">NWIS</h1>
          <p className="boot__text">
            Establishing a link to the intelligence service…
          </p>
          <LoadingState label="Contacting backend" />
        </div>
      </div>
    );
  }

  if (!everConnected) {
    return (
      <div className="boot">
        <div className="boot__inner">
          <span className="boot__mark" aria-hidden="true" />
          <h1 className="boot__title">Backend unreachable</h1>
          <p className="boot__text">
            NWIS could not reach the intelligence service. Start it from the
            project root, then reload this page.
          </p>
          <code className="boot__cmd">
            {"python -m uvicorn backend.main:app --port 8000"}
          </code>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.location.reload()}
          >
            Retry connection
          </button>
          <p className="boot__text" style={{ color: "var(--text-faint)" }}>
            Frontend API base:{" "}
            <span className="mono">
              {import.meta.env.VITE_API_BASE ?? "default (dev proxy / 127.0.0.1:8000)"}
            </span>
          </p>
        </div>
      </div>
    );
  }

  const intelBand = bandForLevel(headlineLevel);
  const backendOffline = intel.status === "error";

  return (
    <div className="app">
      <a className="skip-link" href="#sec-map">
        Skip to the command centre
      </a>

      <TopBar
        wellId={ACTIVE_WELL}
        formation={intel.data?.well?.formation ?? activeRecord?.formation}
        depth={liveFrame?.depth ?? intel.data?.well?.depth ?? intelDepth}
        mode={systemState.mode}
        riskLevel={headlineLevel}
        riskScore={headlineScore}
        systemState={systemState}
        clock={clock}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <div className="provenance">
        {systemState.reachable ? (
          <>
            <span className="provenance__tag">Prototype</span>
            <span className="provenance__sep" />
          </>
        ) : (
          <>
            <span
              className="provenance__tag"
              style={{ color: "var(--crit)" }}
              role="status"
            >
              Link degraded
            </span>
            <span className="provenance__sep" />
          </>
        )}
        <span className="provenance__text">Demonstration data</span>
        <span className="provenance__sep" />
        <span className="provenance__text">Simulated stream</span>
        <span className="provenance__sep" />
        <span className="provenance__text">
          No Oil India Limited / eRTMAC connection
        </span>
        <span className="provenance__spacer" />
        <button
          type="button"
          className="provenance__btn"
          onClick={() => setProvenanceOpen(true)}
        >
          <IconInfo size={11} />
          Data provenance
        </button>
      </div>

      <DemoBar
        demo={demo}
        intelligenceStatus={intel.status}
        onOpenProvenance={() => setProvenanceOpen(true)}
      />

      <div className="shell">
        <SectionRail
          active={activeSection}
          onNavigate={go}
          severityBySection={severityBySection}
        />

        <main className="main" id="main">
          {backendOffline ? (
            <div className="banner banner--crit" role="alert">
              <IconInfo size={15} className="banner__icon" />
              <div className="banner__body">
                <span className="banner__title">
                  Historical intelligence could not be retrieved
                </span>
                <span className="banner__text">
                  The risk engine, offset ranking, depth correlation and
                  retrieval are unavailable. The rest of the dashboard keeps
                  running on the live stream.
                </span>
                <span className="banner__actions">
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={intel.retry}
                  >
                    Retry intelligence
                  </button>
                </span>
              </div>
            </div>
          ) : null}

          {/* ============ MAP + RISK ============ */}
          <div className="grid grid--command">
            <div className="col">
              <PanelBoundary label="Nearby wells map" onRetry={() => window.location.reload()}>
              <Panel
                id="sec-map"
                index="01"
                title="Nearby wells intelligence"
                subtitle="Geospatial"
                severity={intelBand.key}
                accent
                bodyClass="panel__body--flush"
                tools={
                  <>
                    <span className="badge badge--plain">
                      {correlatedWellIds.size} correlated
                    </span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setSearchOpen(true)}
                    >
                      <IconSearch size={12} />
                      Find well
                    </button>
                  </>
                }
              >
                <WellMap
                  activeWell={intel.data?.active_well_data ?? activeRecord}
                  activeDepth={liveFrame?.depth ?? intel.data?.well?.depth ?? intelDepth}
                  activeFormation={
                    intel.data?.well?.formation ?? activeRecord?.formation
                  }
                  activeScore={headlineScore}
                  offsets={intel.data?.offsets ?? []}
                  correlatedWellIds={correlatedWellIds}
                  selectedWellId={selectedOffset?.well_id}
                  onSelectWell={setSelectedOffset}
                  onOpenWell={(offset) => {
                    setSelectedOffset(offset);
                    setDrawerOpen(true);
                  }}
                  radiusKm={radiusKm}
                  onRadiusChange={setRadiusKm}
                />
              </Panel>
              </PanelBoundary>

              <PanelBoundary label="Live drilling telemetry">
              <Panel
                id="sec-telemetry"
                index="05"
                title="Live drilling telemetry"
                subtitle="Streaming parameters"
                tools={
                  telemetrySource === "replay" ? (
                    <span
                      className="badge"
                      data-sev={stream.status === "open" ? "low" : "medium"}
                    >
                      <i className="badge__dot" aria-hidden="true" />
                      WS {stream.status}
                    </span>
                  ) : null
                }
              >
                <LiveTelemetry
                  scenarioFrame={demo.frame}
                  scenarioHistory={demo.history}
                  streamStatus={stream.status}
                  streamPoints={streamPoints}
                  streamLastMessageAt={stream.lastMessageAt}
                  source={telemetrySource}
                  onSourceChange={setTelemetrySource}
                />
              </Panel>
              </PanelBoundary>

              <PanelBoundary label="Alert lifecycle">
              <Panel
                id="sec-lifecycle"
                index="06"
                title="Alert lifecycle"
                subtitle="Detected → correlated → acknowledged → resolved"
                severity={
                  intel.data?.alert?.lifecycle?.tracked
                    ? intelBand.key
                    : "none"
                }
                bodyClass="panel__body--flush"
                tools={
                  intel.data?.alert?.lifecycle?.tracked ? (
                    <span className="label mono">
                      {intel.data.alert.lifecycle.tracked.id}
                    </span>
                  ) : (
                    <span className="label">no active alert</span>
                  )
                }
              >
            <AlertLifecycle
              lifecycle={intel.data?.alert?.lifecycle}
              contextual={intel.data}
              onChanged={intel.retry}
            />
              </Panel>
              </PanelBoundary>
            </div>

            <div className="col">
              <PanelBoundary label="Risk intelligence">
              <Panel
                id="sec-risk"
                index="02"
                title="Risk intelligence"
                severity={intelBand.key}
                accent
                bodyClass="panel__body--flush"
                tools={
                  intel.refreshing ? (
                    <span className="label">syncing…</span>
                  ) : null
                }
              >
                <RiskPanel
                  contextual={intel.data}
                  liveFrame={liveFrame}
                  loading={intel.loading}
                  error={intel.error}
                  onRetry={intel.retry}
                  riskHistory={riskHistory}
                />
              </Panel>
              </PanelBoundary>

              <PanelBoundary label="Why now panel">
              <Panel
                id="sec-whynow"
                index="03"
                title="Why now?"
                subtitle="Convergence of live behaviour and recorded experience"
                severity={
                  intel.data?.why_now?.convergence
                    ? intelBand.key
                    : "none"
                }
                accent
              >
                {intel.loading && !intel.data ? (
                  <SkeletonRows rows={4} columns={[0.5, 0.3, 0.2]} />
                ) : (
                  <WhyNow
                    whyNow={intel.data?.why_now}
                    liveFrame={liveFrame}
                    currentDepth={
                      liveFrame?.depth ??
                      intel.data?.well?.depth ??
                      intelDepth
                    }
                  />
                )}
              </Panel>
              </PanelBoundary>

              <PanelBoundary label="Alert rationale panel">
              <Panel
                id="sec-why"
                index="04"
                title="Why this alert"
                severity={intelBand.key}
              >
                {intel.loading && !intel.data ? (
                  <SkeletonRows rows={5} columns={[0.7, 0.25, 0.18]} />
                ) : (
                  <WhyThisAlert
                    contextual={intel.data}
                    liveFrame={liveFrame}
                    onOpenRationale={() => {
                      setAlertEntry(null);
                      setAlertOpen(true);
                    }}
                  />
                )}
              </Panel>
              </PanelBoundary>
            </div>
          </div>

          {/* ============ ALERT TIMELINE ============ */}
          <PanelBoundary label="Alert timeline">
          <Panel
            id="sec-timeline"
            index="12"
            title="Alert timeline"
            subtitle="Derived from the backend stream"
            severity={intelBand.key}
            bodyClass="panel__body--flush"
            tools={
              <>
                <span className="label">{timeline.entries.length} entries</span>
                {timeline.entries.length > 0 ? (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={timeline.clear}
                  >
                    Clear
                  </button>
                ) : null}
              </>
            }
          >
            <AlertTimeline
              entries={timeline.entries}
              activeId={alertEntry?.id}
              onSelect={(entry) => {
                setAlertEntry(entry);
                setAlertOpen(true);
              }}
            />
          </Panel>
          </PanelBoundary>

          {/* ============ HISTORY + DECISION ============ */}
          <div className="grid grid--pair">
            <PanelBoundary label="Historical intelligence">
            <Panel
              id="sec-history"
              index="07"
              title="Historical intelligence"
              subtitle="Depth correlation"
              severity={
                (intel.data?.historical_event_count ?? 0) > 0 ? "medium" : "none"
              }
            >
              <HistoricalIntelligence
                contextual={intel.data}
                wellRecord={activeRecord}
                loading={intel.loading}
                onSelectWell={openWellById}
              />
            </Panel>
            </PanelBoundary>

            <PanelBoundary label="Recommendation panel">
            <Panel
              id="sec-reco"
              index="09"
              title="NWIS recommendation"
              subtitle="Decision support"
              severity="info"
              bodyClass="panel__body--flush"
            >
              <RecommendationPanel
                contextual={intel.data}
                liveFrame={liveFrame}
                onViewEvidence={(source) =>
                  source ? setDocumentSource(source) : go("sec-evidence")
                }
                onOpenAlert={() => {
                  setAlertEntry(null);
                  setAlertOpen(true);
                }}
              />
            </Panel>
            </PanelBoundary>
          </div>

          {/* ============ EVIDENCE ============ */}
          <PanelBoundary label="Evidence panel">
          <Panel
            id="sec-evidence"
            index="08"
            title="Evidence"
            subtitle="Every conclusion is traceable to a source document"
            severity="info"
          >
            {intel.loading && !intel.data ? (
              <SkeletonRows rows={3} columns={[0.35, 0.4, 0.2]} />
            ) : (
              <EvidencePanel
                contextual={intel.data}
                currentDepth={
                  liveFrame?.depth ??
                  intel.data?.well?.depth ??
                  intelDepth
                }
                onViewSource={(source) => setDocumentSource(source)}
                onOpenDocuments={() => go("sec-documents")}
              />
            )}
          </Panel>
          </PanelBoundary>

          <EvidenceChain
            contextual={intel.data}
            liveFrame={liveFrame}
            documents={catalog.documents}
            onNavigate={go}
          />

          {/* ============ DOCUMENTS ============ */}
          <PanelBoundary label="Document intelligence">
          <Panel
            id="sec-documents"
            index="10"
            title="Document intelligence"
            subtitle="Retrieval layer inventory"
            severity="info"
            tools={
              catalog.documents?.pipeline ? (
                <span className="badge badge--plain">
                  {catalog.documents.pipeline.embedding_model}
                </span>
              ) : null
            }
          >
            <DocumentExplorer
              documents={catalog.documents}
              events={catalog.events}
              loading={catalog.loading}
              error={catalog.error}
              onRetry={catalog.reload}
              onOpenSource={setDocumentSource}
              activeSource={documentSource}
            />
          </Panel>
          </PanelBoundary>

          {/* ============ OFFSETS ============ */}
          <PanelBoundary label="Offset explorer">
          <Panel
            id="sec-offsets"
            index="11"
            title="Nearby wells"
            subtitle="Offset explorer"
            tools={
              (intel.data?.offsets?.length ?? 0) > 0 ? (
                <span className="label">
                  ranked by the offset engine
                </span>
              ) : null
            }
          >
            {intel.loading && !intel.data ? (
              <SkeletonRows rows={5} columns={[0.2, 0.5, 0.7, 0.3, 0.3]} />
            ) : intel.data?.offsets?.length ? (
              <OffsetExplorer
                offsets={intel.data.offsets}
                activeFormation={intel.data.well?.formation}
                selectedWellId={selectedOffset?.well_id}
                diagnostics={intel.data.offset_diagnostics}
                onSelectWell={setSelectedOffset}
                onOpenWell={(offset) => {
                  setSelectedOffset(offset);
                  setDrawerOpen(true);
                }}
              />
            ) : (
              <ErrorState
                compact
                title="Offset ranking unavailable"
                message="The offset similarity engine did not return a ranking for this well."
                onRetry={intel.retry}
              />
            )}
          </Panel>
          </PanelBoundary>

          {/* ============ EVALUATION + CLAIM AUDIT ============ */}
          <PanelBoundary label="Prototype evaluation">
          <Panel
            id="sec-evaluation"
            index="13"
            title="Prototype evaluation & claim audit"
            subtitle="What was measured, and what was deliberately not"
            severity="info"
          >
            <PrototypeEvaluation />
          </Panel>
          </PanelBoundary>

          <footer className="foot">
            <span>
              <strong>NWIS</strong> · Nearby Wells Intelligence System
            </span>
            <span>
              API <span className="mono">/api/nwis</span> ·{" "}
              <span className="mono">/api/simulation</span> ·{" "}
              <span className="mono">/api/rag/search</span> ·{" "}
              <span className="mono">/api/documents</span>
            </span>
            <span>
              Backend{" "}
              <span className="mono">{fmtLabel(systemState.system, "NWIS")}</span>{" "}
              {fmtLabel(systemState.mode)} · {fmtLabel(systemState.status)}
            </span>
            <span>
              {catalog.documents?.totals
                ? `${catalog.documents.totals.chunks} chunks · ${catalog.documents.index?.dimension}d embeddings`
                : "index pending"}
            </span>
            <span>
              System time <span className="mono">{clock}</span>
            </span>
          </footer>
        </main>
      </div>

      {/* ============ OVERLAYS ============ */}

      <PanelBoundary label="Well intelligence drawer">
      <WellDrawer
        well={selectedOffset}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCompare={() => setCompareOpen(true)}
        currentDepth={liveFrame?.depth ?? intel.data?.well?.depth ?? intelDepth}
        currentFormation={intel.data?.well?.formation}
        wellRecord={offsetRecord}
        documents={catalog.documents}
        activeWell={ACTIVE_WELL}
        onViewSource={setDocumentSource}
      />
      </PanelBoundary>

      <PanelBoundary label="Well comparison">
      <WellComparison
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        activeWell={ACTIVE_WELL}
        activeRecord={activeRecord}
        activeDepth={liveFrame?.depth ?? intel.data?.well?.depth ?? intelDepth}
        activeSignals={liveFrame?.signals ?? null}
        activeRiskLevel={headlineLevel}
        activeEventCount={intel.data?.historical_event_count ?? 0}
        offset={selectedOffset}
        offsetRecord={offsetRecord}
        offsetEvents={selectedOffset?.historical_events ?? []}
        onViewSource={setDocumentSource}
      />
      </PanelBoundary>

      <PanelBoundary label="Alert rationale">
      <AlertDetailModal
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        entry={alertEntry}
        contextual={intel.data}
        liveFrame={liveFrame}
        onViewSource={setDocumentSource}
        onOpenWell={openWellById}
      />
      </PanelBoundary>

      <PanelBoundary label="Document viewer">
      <DocumentViewer
        source={documentSource}
        onClose={() => setDocumentSource(null)}
        events={catalog.events}
      />
      </PanelBoundary>

      <PanelBoundary label="Global search">
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        wells={catalog.wells}
        events={catalog.events}
        documents={catalog.documents}
        currentDepth={liveFrame?.depth ?? intelDepth}
      />
      </PanelBoundary>

      <PanelBoundary label="Data provenance">
      <DataProvenance
        open={provenanceOpen}
        onClose={() => setProvenanceOpen(false)}
        documents={catalog.documents}
        systemState={systemState}
      />
      </PanelBoundary>
    </div>
  );
}
