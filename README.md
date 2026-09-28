# NWIS — Nearby Wells Intelligence System

**SIH 26121 · prototype · demonstration data only**

NWIS turns scattered historical drilling records into contextual,
explainable intelligence at the moment a drilling engineer needs it.
It is built around Oil India Limited's eRTMAC ecosystem and is
designed as **decision support, not autonomous control**.

> This build is not connected to Oil India Limited or eRTMAC. Every
> well identifier, coordinate, formation and incident record is
> synthetic and generated for demonstration.

---

## The idea

One screen answers, in order:

```
LIVE STATE → RISK → WHY → HISTORICAL CONTEXT → OFFSET WELLS
           → EVIDENCE → RECOMMENDATION → ACTION
```

Every AI conclusion is traceable:

```
AI conclusion → historical evidence → retrieval query → source document
```

Press `Ctrl`/`⌘ + K` for global intelligence search, and
**Data provenance** in the header for the exact backend route behind
every panel.

---

## Run it

### 1. Backend

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python data/generate_demo_data.py    # only if data/ is empty
uvicorn backend.main:app --port 8000 --reload
```

Interactive API reference: <http://127.0.0.1:8000/docs>

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                          # http://127.0.0.1:5173
```

The dev server proxies `/api` and `/ws` to `http://127.0.0.1:8000`
(override with `NWIS_BACKEND`). For a static bundle served elsewhere,
set `VITE_API_BASE` — see `frontend/.env.example`.

```bash
npm run build        # production bundle
npm run preview      # serve the build
npm run lint         # oxlint
```

---

## Demonstration sequence

The scripted scenario is a real backend endpoint, not a UI animation.

1. The dashboard opens at `WELL-001`, 2 840 m, `Formation-Y`, with the
   offset neighbourhood, the ±50 m depth correlation and three indexed
   source documents already loaded.
2. Press **▶** in the demo bar. The sequence advances 2 800 → 2 860 m
   while the risk index moves **LOW 20 → MEDIUM 38 → CRITICAL 95**.
3. The alert timeline records each precursor threshold as it is crossed
   and the historical correlation as it is identified.
4. The sequence **holds** at the critical end so the evidence chain
   stays inspectable, then reports `Sequence complete`.
5. Inspect: the offset drawer, **Compare with active well**, the source
   document behind any citation, the full alert rationale, or the
   provenance table.

Transport controls: start · pause · step · restart, and 0.5× / 1× / 2× /
4× sampling speed. The sequence is bounded at 2 860 m — the deepest step
that keeps a historical event inside the ±50 m comparison band, so the
evidence never disappears at the moment it matters.

---

## What the backend provides

All of the following are existing routes, consumed as-is:

| Route | Used for |
| --- | --- |
| `GET /api/nwis/{well_id}?depth=` | Unified contextual intelligence: offsets, depth correlation, document evidence, recommendation, alert, explainability |
| `GET /api/simulation/{well_id}?step=` | Scripted demonstration sequence and live signal index |
| `ws://…/ws/live/{well_id}` | Streaming telemetry replay scored per frame by the same risk engine |
| `GET /api/wells/{well_id}/offsets` | Offset similarity ranking |
| `GET /api/wells` · `GET /api/events` · `GET /api/evidence/{well_id}` | Reference tables and structured event log |
| `GET /api/rag/search?q=` | FAISS sentence-transformer retrieval |
| `GET /api/documents` · `GET /api/documents/detail` | Retrieval-layer inventory and full indexed text |
| `GET /api/risk/depth` | Depth-window analysis on its own |
| `GET /` | Liveness |

Two read-only routes were **added** for the document explorer, both of
which only read the existing FAISS index and chunk metadata:

- `GET /api/documents` — document/chunk/vector counts, embedding
  dimension, and per-source metadata. The Document Intelligence panel
  reports these figures instead of illustrative ones.
- `GET /api/documents/detail?source=` — the full indexed text of one
  source, so any AI statement can be checked against the original
  wording.

`GET /api/status` is an alias of `GET /`, exposed under `/api` only so a
dev server can proxy the API without shadowing its own index document.
The frontend falls back to `GET /` if it is absent.

---

## Two risk indices, never blended

The backend produces two different numbers and the interface keeps them
apart rather than mixing them:

- **Live signal index** — from the streaming parameters. This is what
  moves during the demonstration and what an operator reacts to now.
- **Contextual index** — signal risk plus up to 15 points of historical
  corroboration for events inside the depth window. This explains *why*
  the score escalated.

Both are labelled **explainable indices, not probabilities of failure**,
on the surface itself. In this demonstration the backend applies a fixed
degraded precursor record when scoring the contextual index, so that
figure saturates while the live index tracks the stream; the risk panel
states this explicitly.

---

## Frontend architecture

```
src/
  App.jsx                 orchestration, section order, overlays
  lib/
    api.js                fetch client: timeouts, aborts, shared cache
    risk.js               severity bands, signal definitions, thresholds
    format.js             null-safe formatting ("Not available")
    query.js              plain-language search interpretation
    documents.js          chunk text → labelled sections
  hooks/
    useSystemStatus       liveness, never gates the dashboard
    useCatalog            wells, events, document index
    useNwisIntelligence   deduplicated, debounced unified read
    useDemoSimulation     start/pause/step/restart/speed
    useTelemetryStream    WebSocket with capped backoff
    useAlertTimeline      entries derived from backend output
    useFocusTrap          layered overlays, one Escape per layer
  components/
    common/               Panel, Badge, States, StreamChart, Drawer,
                          Modal, PanelBoundary, Icons
    layout/               TopBar, DemoBar, SectionRail, DataProvenance
    map/                  WellMap, markers, RadiusControl, MapLegend
    risk/                 RiskPanel, RiskMeter, RiskLadder, WhyThisAlert
    telemetry/            LiveTelemetry
    history/              HistoricalIntelligence, DepthLadder
    evidence/             EvidencePanel, DocumentExplorer, DocumentViewer
    recommendation/       RecommendationPanel, DecisionSupportNotice
    wells/                OffsetExplorer, WellDrawer, WellComparison
    alerts/               AlertTimeline, AlertDetailModal
    search/               GlobalSearch
    dashboard/            EvidenceChain
  styles/                 tokens · base · shell · panels · charts ·
                          map · overlays
```

Principles the structure enforces:

- **No fabricated values.** A missing field renders as *Not available*.
  Capabilities absent from the dataset — directional surveys, formation
  boundaries, offset time series — are stated as absent rather than
  approximated.
- **No duplicated reads.** Reference data is fetched once per session
  through a shared cache; unified intelligence refetches once per 10 m of
  depth advance; the telemetry socket connects only when the replay
  source is selected.
- **No blank cards.** Every API-backed region renders a loading,
  error or empty state, and every panel sits inside an error boundary so
  one fault cannot blank the command centre.
- **Colour is never the only signal.** Severity always ships with its
  word; charts and meters carry ARIA values and text.

---

## Accessibility

Semantic landmarks and a single `h1`; a skip link; every control
reachable and named; visible 2 px focus rings; dialogs with
`role="dialog"`, `aria-modal`, focus trapping and focus restoration;
`aria-live` regions for risk changes; keyboard-navigable search; and
`prefers-reduced-motion` honoured throughout.

---

## Layout

Desktop-first, with breakpoints at 1560 / 1360 / 1200 / 1080 / 900 /
720 / 520 px. Below 1200 px the two-column command grid dissolves and
re-orders to the mobile reading sequence:

```
map → risk → live parameters → rationale
     → alert timeline → depth context → decision
     → evidence → documents → offsets
```

DOM order is unchanged; only the visual order moves.

---

## MVP scope

- Synthetic historical offset-well dataset
- Contextual offset similarity ranking
- Lost-circulation and stuck-pipe risk scoring
- Simulated live drilling stream
- FastAPI backend + WebSocket
- Semantic RAG over PDF/OCR-extracted reports
- FAISS vector search with sentence-transformer embeddings
- Evidence-traceable recommendation engine
