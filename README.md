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
LIVE STATE → RISK → WHY NOW → WHY → HISTORICAL CONTEXT → OFFSET WELLS
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

## The one number that matters most

> The dataset's generator injects the precursor signature within
> ±45 m of every event it creates. Replay therefore returns a
> **100 % detection rate that is a property of the data, not of the
> engine.** NWIS detects this at runtime, proves it empirically, and
> **withholds** the figure. See
> [`docs/ARCHITECTURE.md` §6](docs/ARCHITECTURE.md).

This is why there is no accuracy, precision, recall or F1 number
anywhere in this system, and why the evaluation panel on the
dashboard shows as much space for "Not measured" as for measured
results.

---

## Run it

### Quick start (both services)

```bash
./scripts/dev.sh          # starts both, waits until they answer
./scripts/dev.sh stop
```

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

### 3. Evaluation, replay and smoke test

```bash
python -m evaluation.evaluate        # → evaluation/results/evaluation.json
python -m evaluation.replay --all    # → evaluation/results/replay.json
python -m evaluation.smoke           # → evaluation/results/smoke.json
```

`evaluation.smoke` drives the running dashboard in a headless
browser and fails on any console error, page error or failed
request. It is how the "zero critical frontend errors" claim is
demonstrated rather than asserted.

The smoke test needs a browser:

```bash
pip install playwright && python -m playwright install chromium
```

---

## Measured results

From `python -m evaluation.evaluate`, on the synthetic dataset:

| Measurement | Result |
| --- | --- |
| Top-ranked offset is **not** the nearest well | **86.7 %** (26 / 30 wells) |
| Top-1 offset shares the active formation | 96.7 % (29 / 30 wells) |
| Risk engine deterministic on re-score | 1 170 / 1 170 windows |
| Contributor breakdown reconciles to the score | 1 170 / 1 170 windows |
| Median risk latency | 0.51 ms |
| Median retrieval latency | ~25 ms |
| Median replay lead distance | 4.42 m |
| Headless smoke test | 19 / 19 steps, 0 console errors |

**Deliberately not measured**, each with the reason recorded in
`evaluation.json → null_field_reasons`: alert precision, alert
recall, false-alarm rate, median lead time, offset Top-1/Top-3
relevance, and any accuracy figure.

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module map, the intelligence chain, the circularity finding, and the **PRODUCTION PATH** for WITSML/ETP, security, RBAC, versioning and drift |
| [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) | The 3-minute SIH run, anticipated judge questions, and recovery steps |
| [`docs/SIH_SLIDES.md`](docs/SIH_SLIDES.md) | The six submission slides and the PPT quality audit |
| [`docs/REFERENCES.md`](docs/REFERENCES.md) | Standards and methods, with what each contributes and where it is used |
| Live in the app | `GET /api/claim-audit` — every system claim classified against the code |

---

## What the backend provides

All of the following are existing routes, consumed as-is:

| Route | Used for |
| --- | --- |
| `GET /api/nwis/{well_id}?depth=` | Unified contextual intelligence: offsets, depth correlation, document evidence, recommendation, alert, explainability |
| `GET /api/simulation/{well_id}?step=` | Scripted demonstration sequence and live signal index |
| `ws://…/ws/live/{well_id}` | Streaming telemetry replay scored per frame by the same risk engine |
| `GET /api/wells/{well_id}/offsets` | Offset similarity ranking, with the per-factor breakdown |
| `GET /api/wells` · `GET /api/events` · `GET /api/evidence/{well_id}` | Reference tables and structured event log |
| `GET /api/rag/search?q=&mode=` | Hybrid (BM25 + vector) retrieval; `mode=vector` reproduces the vector-only baseline |
| `GET /api/documents` · `GET /api/documents/detail` | Retrieval-layer inventory and full indexed text |
| `GET /api/risk/depth` | Depth-window analysis on its own |
| `GET /` · `GET /api/status` | Liveness |

### Explainability

| Route | Returns |
| --- | --- |
| `GET /api/risk/contributors` | Full additive breakdown of the index, reconciled to the headline |
| `GET /api/why-now/{well_id}` | Convergence explanation, optionally from a supplied live frame |
| `GET /api/wells/{well_id}/offset-diagnostics` | Whether the ranking is more than a nearest-well lookup |
| `GET /api/risk/model` | Rule set, thresholds, saturation points, and an explicit statement of what the model is not |
| `GET /api/retrieval/config` | Live hybrid weights and supported filters |

### Alert lifecycle

| Route | Returns |
| --- | --- |
| `GET /api/alerts` · `GET /api/alerts/{id}` | Lifecycle state and full transition history |
| `POST /api/alerts/{id}/state?state=` | Advance to `ACKNOWLEDGED` or `RESOLVED`; validated server-side |

### Assurance

| Route | Returns |
| --- | --- |
| `GET /api/claim-audit` | 39 claims, each classified as IMPLEMENTED / DEMONSTRATED / MEASURED / PROPOSED / PRODUCTION PATH / NOT VALIDATED |
| `GET /api/evaluation` | The measured benchmark, read from `evaluation.json` |
| `GET /api/evaluation/replay` | Replay results, including the circularity finding |

---

## Two risk indices, never blended

The backend produces two different numbers and the interface keeps
them apart rather than mixing them:

- **Live signal index** — from the streaming parameters. This is what
  moves during the demonstration and what an operator reacts to now.
- **Contextual index** — signal risk plus up to 15 points of historical
  corroboration for events inside the depth window. This explains *why*
  the score escalated.

Both are labelled **explainable indices, not probabilities of failure**,
on the surface itself, and the backend returns
`is_probability: false` with every score. In this demonstration the
backend applies a fixed degraded precursor record when scoring the
contextual index, so that figure saturates while the live index tracks
the stream; the risk panel states this explicitly.

The contributor bars under the headline number are the same
`weight × normalised change` products the engine summed to produce
it, and they are reconciled so they always add up. The backend
asserts that identity and the panel states it if it ever fails.

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
    risk/                 RiskPanel, RiskMeter, RiskLadder,
                          WhyThisAlert, RiskContributors
    telemetry/            LiveTelemetry
    history/              HistoricalIntelligence, DepthLadder
    evidence/             EvidencePanel, DocumentExplorer, DocumentViewer
    recommendation/       RecommendationPanel
    wells/                OffsetExplorer, WellDrawer, WellComparison,
                          OffsetFactors
    alerts/               AlertTimeline, AlertDetailModal, AlertLifecycle
    search/               GlobalSearch
    why/                  WhyNow
    evaluation/           PrototypeEvaluation
    dashboard/            EvidenceChain
  styles/                 tokens · base · shell · panels · charts ·
                          map · explain · overlays
```

Principles the structure enforces:

- **No fabricated values.** A missing field renders as *Not available*.
  Capabilities absent from the dataset — directional surveys, formation
  boundaries, offset time series, TVD — are stated as absent rather
  than approximated.
- **No duplicated reads.** Reference data is fetched once per session
  through a shared cache; unified intelligence refetches once per 10 m
  of depth advance; the telemetry socket connects only when the replay
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
map → lifecycle → risk → why now → live parameters → rationale
     → alert timeline → depth context → decision
     → evidence → documents → offsets → evaluation
```

DOM order is unchanged; only the visual order moves.

---

## MVP scope

- Synthetic historical offset-well dataset
- Contextual offset similarity ranking with per-factor explanation
- Rule-based risk index with an exact additive contributor breakdown
- Depth-window correlation, reported as such rather than as
  geological correlation
- Simulated live drilling stream over WebSocket
- FastAPI backend + WebSocket
- Hybrid BM25 + vector retrieval over narrative incident documents
- FAISS vector search with sentence-transformer embeddings
- Validated alert lifecycle with server-side transitions
- Evidence-traceable recommendation engine
- Reproducible evaluation, replay and smoke-test harnesses
- Machine-readable claim audit
