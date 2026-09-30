# NWIS — Architecture, Validation Status and Production Path

**SIH 2026 · Problem statement 26121 · prototype**

Every section below is labelled with its status. The labels are
not decoration: they are the difference between a prototype that
can be defended in a viva and one that cannot.

| Label | Meaning |
| --- | --- |
| **CURRENT PROTOTYPE** | Implemented and running in this repository |
| **MEASURED** | Computed by `python -m evaluation.*` from this repository's data |
| **PRODUCTION PATH** | Proposed design. **Not implemented.** |
| **NOT VALIDATED** | Requires a real labelled dataset that does not exist here |

The machine-readable version of this document is served live at
`GET /api/claim-audit` and rendered in the dashboard's
*Prototype evaluation & claim audit* panel.

---

## 1. What the system is

> **CURRENT PROTOTYPE**
>
> NWIS connects what is happening now with what happened before,
> where it happened, and what the drilling engineer should
> review.

```
LIVE DRILLING
      ↓
CURRENT BEHAVIOUR
      ↓
OFFSET-WELL CONTEXT
      ↓
DEPTH + FORMATION CORRELATION
      ↓
HISTORICAL EVIDENCE
      ↓
CONTEXTUAL RISK INTELLIGENCE
      ↓
EXPLAINABLE RECOMMENDATION
      ↓
ENGINEER DECISION
```

Every arrow in that chain is one module in this repository, and
every number on screen is traceable to a rule that a reviewer can
read in the source.

---

## 2. CURRENT PROTOTYPE — module map

| Module | File | Responsibility |
| --- | --- | --- |
| Offset ranking | `ml/offset_similarity.py` | Six-factor weighted similarity, per-factor breakdown, nearest-vs-top diagnostics, depth-window correlation |
| Risk engine | `ml/risk_engine.py` | Weighted parameter trends, saturation caps, additive contributor decomposition, level bands |
| Retrieval | `rag/rag_engine.py` | Chunking, MiniLM embeddings, FAISS index, **hybrid BM25 + vector search** with drilling metadata filters |
| Why-now | `backend/why_now.py` | Assembles the convergence explanation from measured values only |
| Alert lifecycle | `backend/alerts.py` | Validated `DETECTED → … → RESOLVED` state machine |
| Claim audit | `backend/claims.py` | Machine-readable classification of every system claim |
| Recommendations | `backend/recommendations.py` | Rule-based action prompt keyed on the matched event type |
| API | `backend/main.py` | 26 REST routes + 1 WebSocket |
| Evaluation | `evaluation/*.py` | Replay, benchmark and headless smoke test, all emitting JSON |

### Data stores — **CURRENT PROTOTYPE**

| Store | Path | Contents | Status |
| --- | --- | --- | --- |
| Wells | `data/wells.csv` | 30 wells, lat/lon, formation, trajectory class, total depth, hole section | Synthetic |
| Events | `data/events.csv` | 15 incidents with depth, formation, severity, precursors, mitigation | Synthetic |
| Telemetry | `data/drilling_data.csv` | 3 600 records, 11 channels, 20-minute cadence | Synthetic |
| Documents | `data/documents/*.txt` | 3 narrative DDRs | Synthetic |
| Vector index | `data/rag.index` + `rag_metadata.json` | 3 chunks, 384-d | Derived from the above |

> **The data generator injects the answer.** `data/generate_demo_data.py`
> applies `rop × 0.62`, `torque × 1.55`, `ecd + 0.08`, `pit − 5 bbl`
> within ±45 m of every event depth it writes. This is verified
> empirically at runtime (§6). It is the single most important
> caveat in this project.

---

## 3. The intelligence chain, honestly

### 3.1 Offset intelligence — **CURRENT PROTOTYPE / MEASURED**

The ranking is a fixed-weight sum over six factors
(`ml/offset_similarity.OFFSET_WEIGHTS`):

| Factor | Weight | Measured from |
| --- | --- | --- |
| Formation match | 0.25 | exact formation name match |
| Distance | 0.20 | haversine, linear decay to zero at 8 km |
| Trajectory | 0.15 | profile class only — **no survey exists** |
| Hole section | 0.15 | casing/hole size class |
| Depth proximity | 0.15 | total-depth difference, decay to zero at 1 500 m — **a proxy, not MD/TVD correlation** |
| Event similarity | 0.10 | count of same-formation events, saturating at 2 |

Each factor is returned to the interface with its weight, its
normalised similarity, its point contribution and the sentence
describing how it was derived. A factor whose attribute was
never recorded is returned as `available: false` and renders as
**"Not available"** — it is never scored as zero.

**MEASURED** — the ranking is not a nearest-well lookup:

| Figure | Value |
| --- | --- |
| Wells evaluated | 30 |
| Top-1 is **not** the nearest well | **86.7 %** (26 / 30) |
| Top-1 shares the active formation | 96.7 % |

For the demonstration well: the nearest neighbour is
**WELL-029 at 1.35 km** (relevance 71.5), but the engine ranks
**WELL-017 at 1.38 km** first (relevance 84.5).

> **NOT VALIDATED** — Top-1 / Top-3 *relevance*. These require
> ground-truth labels naming the correct analogue well, chosen by
> a drilling engineer. None exist. Scoring the ranker against the
> only available attributes would be circular, because those
> attributes are what the ranker already consumes.

### 3.2 Risk engine — **CURRENT PROTOTYPE / MEASURED / NOT VALIDATED as a predictor**

```
score = 100 × (0.35·rop + 0.25·torque + 0.25·ecd + 0.15·pit)
```

Each term is a parameter trend normalised against its saturation
point and clamped to 1.0. The contextual index adds
`min(3 × events_in_window, 15)` points of historical corroboration.

**The score is labelled `RISK SCORE … / 100`, never a
probability.** The backend returns `is_probability: false` and
`score_type: "explainable_index_0_100"`.

**MEASURED** — the decomposition is exact, not illustrative:

| Check | Result |
| --- | --- |
| Rolling windows scored | 1 170 across 30 wells |
| Contributor reconciliation failures | **0** |
| Determinism (re-score divergence) | **0** |
| Score range observed | 0.0 – 95.7 |
| Median risk latency | 0.51 ms |

Reconciliation uses largest-remainder allocation
(`ml/risk_engine._reconcile`) so the five bars always sum to the
headline figure to one decimal. An earlier revision drifted by up
to 0.2 points from independent rounding; that was a real defect
and is fixed.

> **NOT VALIDATED** — accuracy, precision, recall, F1, false-alarm
> rate. No labelled incident set exists here, and the labels that
> do exist are circular (§6). No such figure appears anywhere in
> this system.

### 3.3 Depth correlation — **CURRENT PROTOTYPE**

Matching is a **measured-depth window within one named
formation**. The API states this explicitly:

```json
"depth_correlation": {
  "method": "Depth-window correlation",
  "measured_depth_available": true,
  "true_vertical_depth": null,
  "trajectory_survey_available": false,
  "formation_tops_available": false,
  "stratigraphic_correlation": false,
  "production_path": "MD + TVD + trajectory + formation tops + stratigraphic framework"
}
```

> **NOT VALIDATED** — geological or stratigraphic correlation.
> No TVD, no directional survey, no formation tops and no
> stratigraphic framework exist in the dataset. NWIS does **not**
> perform geological correlation and does not claim to.

### 3.4 Retrieval — **CURRENT PROTOTYPE**

Hybrid, not generic:

```
0.35 × BM25(k1=1.5, b=0.75)  +  0.65 × cosine(MiniLM-L6-v2)
+ 0.10 × depth-proximity bonus, when a depth is recorded
```

Hard pre-filters, applied **before** scoring:

| Filter | Behaviour |
| --- | --- |
| `well_id` | case-insensitive; `UNKNOWN` passes through |
| `formation` | case-insensitive, canonicalised on both sides |
| `event_type` | bidirectional substring match on the canonical event name |
| `reference_depth ± window` | rejects only on a *recorded* depth |

Domain-specific behaviour that a generic vector store would miss:

- **Hyphen-aware tokenisation** — `WELL-017` is one term. Splitting
  it on the hyphen destroys the strongest lexical signal in a
  drilling corpus.
- **Domain synonym expansion** — *mud loss → lost circulation*,
  *pack-off → stuck pipe*, *lcm → lcm treatment*.
- **Vocabulary canonicalisation** — documents were extracted from
  an upper-cased string, producing `FORMATION-Y` while `wells.csv`
  writes `Formation-Y`. Unreconciled, a formation filter silently
  matches **nothing**. This was a live defect; both stores now
  speak one vocabulary (`rag/rag_engine.canonical_formation`).
- **Structural fields** — `severity`, `date`, `mitigation`,
  `lesson_learned` are now extracted and shown.

**MEASURED** — the `mud loss` query, which vector-only search
ranks poorly, now retrieves the MUD LOSS DDR at lexical score
1.000 with a *Lost Circulation* canonical event.

> Retrieval relevance is a **similarity for ranking**, not a
> probability and not a statement that an incident will recur.

**Page numbers.** Captured per PDF page during ingestion. Plain
text has no page concept, so its citations render
**"Page unavailable"** — the demonstration corpus is three `.txt`
files, and all three say so rather than inventing a number.

### 3.5 Alert lifecycle — **CURRENT PROTOTYPE**

```
DETECTED → ANALYZING → CORRELATED → ALERT → ACKNOWLEDGED → RESOLVED
```

Transitions are validated server-side. Backwards moves,
unknown stages, and acknowledgement before the alert was raised
are rejected with a stated reason. The interface disables the
buttons for any move the API would refuse, so it never offers an
illegal transition.

Acknowledgement and resolution are **real** — `POST
/api/alerts/{id}/state` mutates state and the panel reflects it.

> **NOT VALIDATED** — rig-time timestamps. There is no eRTMAC
> connection; all timestamps are server wall-clock over a
> simulated stream, and every payload carries `clock_source`
> saying so.
>
> **PRODUCTION PATH** — durable storage. The registry is in-memory
> and a backend restart clears it. Stated in
> `GET /api/alerts → persistence`.

### 3.6 Why-now — **CURRENT PROTOTYPE**

The sentence is assembled from measured values, clause by clause,
and the panel shows the clauses:

> NWIS detected convergence between current drilling behaviour and
> historical offset-well experience: 4 of 4 tracked parameters are
> moving adversely (ROP ↓ 50 %, Torque ↑ 80 %, ECD ↑ 8 %, Pit
> volume ↓ 6 %); 1 historical event of the same formation sits
> within ±50 m of the current bit depth; the closest is WELL-012
> Stuck Pipe at 2812 m, 28 m from the bit.

Arrow direction is the sign of the measured change. "Adverse" is
the direction declared in `ml/risk_engine.RISK_MODEL`. A clause
is **omitted** when its measurement is missing, never defaulted.

> Convergence is a **descriptive** statement that present
> behaviour and past recorded experience describe the same
> interval. It is not a prediction that the event will recur.

---

## 4. PRODUCTION PATH — real-time integration

Not implemented. There is no WITSML, ETP or eRTMAC client in this
repository. This is the design that would close the gap.

```
eRTMAC
   ↓
WITSML / API / ETP
   ↓
NWIS Stream Adapter
   ↓
Normalization
   ↓
Feature Extraction
   ↓
Risk Engine
   ↓
Alert Manager
   ↓
NWIS Dashboard
```

| Element | Specification | Status |
| --- | --- | --- |
| Transport | WITSML 1.4.1.1 / 2.0 over MQTT or WSS, ETP 1.3 as fallback | **PRODUCTION PATH** |
| Data contract | Channel map: `rop`, `torque`, `ecd`, `pit_volume` → MD, TVD, timestamp, well ID. Mandatory fields validated on arrival; rejected frames are counted, not silently dropped | **PRODUCTION PATH** |
| Latency target | **≤ 500 ms** p95 from frame arrival to alert render. Proposed, not a measured SLO | **PRODUCTION PATH** |
| Normalization | Unit and reference conversion (sg ↔ ppg, kN·m ↔ lb·ft), depth-reference resolution (MD/TVD), clock alignment, gap detection | **PRODUCTION PATH** |
| Fallback | WITSML primary → ETP secondary → cached last-good state, with the active source shown in the UI. Degradation is announced, never silent | **PRODUCTION PATH** |
| Alert acknowledgement | Persisted, actor-attributed, synchronised to the operator's roster | **PRODUCTION PATH** (lifecycle *state machine* is **CURRENT PROTOTYPE**) |
| Audit trail | Append-only log of every frame ingested, every index consulted, every conclusion reached, with a correlation ID per alert | **PRODUCTION PATH** |
| Streaming implementation | The WebSocket transport in this repository is **real**; the source is `data/drilling_data.csv`, not a rig | **CURRENT PROTOTYPE transport / simulated source** |

---

## 5. PRODUCTION PATH — security and operations

None of the following is implemented. They are design commitments.

| Area | Design |
| --- | --- |
| Deployment | On-premise, air-gapped-capable. No outbound calls; all models vendored locally. Drilling data does not leave the operator's control |
| RBAC | Role × well-entity × action. Roles: viewer, drilling engineer, supervisor, admin, auditor. Alert acknowledgement requires the engineer role |
| Audit logging | Append-only, tamper-evident (hash-chained), exported to the operator's SIEM. Records data access, not only writes |
| Encryption | TLS in transit; AES-256 at rest for document and telemetry stores; envelope encryption with a KMS-held key |
| Model versioning | Every index carries the embedding model id, the chunking parameters and a content hash of its corpus. A retrieval result is only valid for a named index version |
| FAISS index versioning | Immutable, content-addressed index snapshots with atomic promotion. Rebuild never mutates the live index |
| Data retention | Per-entity retention windows (e.g. telemetry 2 y, documents 10 y), legal hold override, documented purge job |
| Monitoring | Ingest lag, frame-drop rate, index recall on a holdout set, alert-rate anomaly detection, dependency health |
| Drift detection | Feature drift on the four signal channels against the training-window distribution; index drift measured as holdout recall decay |
| Controlled retraining | Retraining is a gated pipeline: new labelled set → validation against the acceptance thresholds → reviewer sign-off → versioned promotion. Never automatic |
| Calibration | Any output described as a probability requires isotonic or Platt calibration against observed base rates first, with reliability curves published |
| Uncertainty | Bounded output. When the index version, model version or base rate is missing or stale, the system degrades to "not assessed" rather than emitting a number |

---

## 6. MEASURED results, and the circularity finding

`python -m evaluation.evaluate` → `evaluation/results/evaluation.json`

### Measured

| Metric | Value |
| --- | --- |
| Offset top-1 is not the nearest well | **86.7 %** (26/30 wells) |
| Offset top-1 shares the active formation | 96.7 % (29/30 wells) |
| Depth-window recall at each event's own depth | 15/15 |
| Risk engine deterministic | 1 170/1 170 windows |
| Contributor reconciliation failures | 0 / 1 170 |
| Median risk latency | 0.51 ms |
| Median retrieval latency | ~25 ms |
| Median API latency (in-process, 7 routes) | ~2 ms |
| Median replay lead distance | 4.42 m |
| Headless smoke test | 19/19 steps, 0 console errors, 0 page errors, 0 failed requests |

### Withheld — and why

| Field | Status | Reason |
| --- | --- | --- |
| `offset_top1_relevance` | **null** | No engineer-annotated ground truth for "correct analogue" |
| `offset_top3_relevance` | **null** | Same |
| `event_precision_at_5` | **null** | Measured, but a definitional identity — querying at an event's own depth returns it. Not a performance claim |
| `event_recall_at_5` | **null** | Same |
| `rag_evidence_relevance` | **null** | Measured, but a 3-document corpus with queries naming each document's own well ID puts hit rate at its ceiling |
| `alert_precision` | **null** | Requires an independent labelled incident set |
| `alert_recall` | **null** | Same |
| `false_alarm_rate` | **null** | Same |
| `median_lead_time` | **null** | The event table records **no incident timestamps**, so minutes cannot be derived without fabrication |

### The circularity finding

Replay over all 30 wells returns a detection rate of **1.0**.
That number is withheld, and here is the proof of why.

`data/generate_demo_data.py` injects a precursor fingerprint
within ±45 m of every event it writes:

```python
if event_depth and abs(depth - event_depth) < 45:
    rop    *= 0.62
    torque *= 1.55
    ecd    += 0.08
    pit    -= 5
```

`evaluation.replay.verify_circularity()` measures the fingerprint
in the data rather than trusting the source:

| Parameter | Measured ratio, event window ÷ baseline | Generator's factor |
| --- | --- | --- |
| ROP | **0.631** | ×0.62 |
| Torque | **1.507** | ×1.55 |
| ECD | 1.071 | +0.08 |
| Pit volume | 0.943 | −5 bbl |

Signature detected in **15 of 15** event-bearing wells.

A detection rate of 1.0 here measures the data generator, not the
risk engine. Quoting it would be the single most damaging thing
this submission could do. It is retained as
`descriptive_detection_rate` for transparency and excluded from
`detection_rate`.

> **Replay framework implemented; validation dataset
> insufficient for statistically meaningful results.**

---

## 7. PRODUCTION VALIDATION PATH

The current risk engine is a rule set
(`ml/risk_engine.RISK_MODEL`, version `rules-v1`). No model is
trained, fitted or calibrated. Retrieval uses a **pretrained**
sentence transformer, not a model trained on NWIS data.

```
CURRENT PROTOTYPE                      PRODUCTION PATH
─────────────────                      ──────────────
Rules / heuristics                     Rules + physics (drilling model,
+ historical correlation                  torque-and-drag, hydraulics)
+ behavioural signals                  + validated ML
+ offset evidence                     + calibration
+ semantic retrieval                  + uncertainty bounds
                                       + mandatory expert review
```

Sequence:

1. Obtain an operator-labelled incident set from real historical
   wells, with precursors **not injected**.
2. Cross-validate on held-out wells, never on the set used to
   choose thresholds.
3. Calibrate against observed base rates (isotonic or Platt)
   before any output is described as a probability.
4. Report precision, recall, false-alarm rate and lead
   distance/time **with confidence intervals**.
5. Add uncertainty bounds. Where the base rate is unknown, report
   "not assessed" rather than a number.
6. Expert review stays mandatory. NWIS is decision support; it
   does not act.

Acceptance thresholds are deliberately left **null**: setting
them here without a labelled set would be inventing a target and
then claiming to have met it.

---

## 8. Reproducing every number in this document

```bash
python -m evaluation.replay --all      # → evaluation/results/replay.json
python -m evaluation.evaluate          # → evaluation/results/evaluation.json
python -m evaluation.smoke             # → evaluation/results/smoke.json
curl -s localhost:8000/api/claim-audit | python -m json.tool
```

All three are deterministic and re-runnable. Latency figures vary
by machine; every other value is exact.
