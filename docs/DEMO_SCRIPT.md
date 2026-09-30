# NWIS — 3-Minute Demonstration Script

**SIH 2026 · 26121 · NWIS — Nearby Wells Intelligence System**

Demo one loop, not every feature. The judges should leave
remembering the *chain*, not a list of panels.

**Before you start:** backend on `:8000`, frontend on `:5173`,
browser at 100 % on a 1680-wide window, `Ctrl`/`⌘ + K` unused, and
`data/rag.index` already built (it is committed).

**If asked "is this real data?" — say so first, not last.** The
header strip says *Demonstration data · Simulated stream · No Oil
India Limited / eRTMAC connection* on every screen. Do not
apologise for it; it is the point.

---

## The 3-minute run

| Time | Action | What is on screen | What you say |
| --- | --- | --- | --- |
| **00:00** | Land on the dashboard. Do not touch the mouse. | Risk **CRITICAL 99/100**, WHY NOW panel filled, alert lifecycle at **ALERT** | "This is NWIS. A drilling operations centre. It is running on synthetic data — no OIL or eRTMAC connection, and we will not pretend otherwise. Watch what happens when the bit reaches a bad interval." |
| **00:15** | Point at the top bar. | `WELL-001 · Formation-Y · 2840 m` | "One well, one formation, one bit position. Everything below is about this number: 2 840 metres." |
| **00:30** | Point at the map. | 7 offsets, WELL-017 highlighted amber, WELL-029 diamond | "Seven nearby wells. The engine ranked them. The filled diamond is the *nearest* well at 1.35 km. The amber marker is the one the engine chose — 1.38 km away, and 13 points more relevant." |
| **00:45** | Press **▶** in the demo bar. | Depth begins to advance | "Depth is advancing. Watch the four parameters." |
| **01:00** | ROP tile drops. | ROP 28 → 11 m/hr | "Rate of penetration is falling." |
| **01:15** | Torque climbs. | Torque 12 → 30 kN·m | "Torque is climbing while penetration falls. That combination, not either alone." |
| **01:30** | ECD rises. | ECD 1.14 → 1.30 sg | "ECD is rising. The drilling window is narrowing." |
| **01:40** | The risk panel. | Index climbs to **CRITICAL**; contributor bars fill | "Risk index, 99 out of 100. And here is where every point came from — ROP 35, torque 25, ECD 25, pit 11, historical 3. The bars *are* the number. Nothing is hidden behind it." |
| **01:50** | Scroll to **WHY NOW?**. | The convergence sentence, four adverse signals, WELL-012 at −28 m | "Why now. Four of four parameters are moving adversely — 50 %, 80 %, 8 %, 6 % — and one historical event in this same formation sits 28 metres from the bit. The sentence is generated from those numbers. Expand *How this sentence was produced* and it shows you the clauses." |
| **02:00** | Scroll to **ALERT LIFECYCLE**. | DETECTED → ANALYZING → CORRELATED → ALERT, with timestamps | "The alert is not a notification. It is a tracked object with a lifecycle. Detected, analysed, correlated against history, then raised. Click **Acknowledge** — the transition is validated on the server." |
| **02:10** | Scroll to **EVIDENCE**. | DDR_WELL-017 and DDR_WELL-012, with depth difference | "Every conclusion is traceable. Well, depth, depth difference from the bit, formation, event, severity, source, page, relevance. Press **View source** — you land in the original text the index matched." |
| **02:20** | Scroll to **NWIS RECOMMENDATION**. | The action prompt + evidence | "What to review. Decision support, not autonomous control. The engineer decides." |
| **02:30** | Scroll to **OFFSETS**, click WELL-017. | *Why WELL-017?* drawer with factor bars | "Now the strongest differentiator. Why this well? Distance, formation, depth, trajectory, hole section, event similarity — each with its own weight, each showing what it was measured from. Nothing is a black box." |
| **02:45** | In the drawer, point at the *not a nearest-well lookup* banner. | The measured statement | "Across all 30 wells in the dataset, the top-ranked analogue is **not** the nearest one 86.7 % of the time. That is measured, not asserted." |
| **03:00** | Scroll to **PROTOTYPE EVALUATION**. | Measured grid, then the "not measured" grid | "This is the part we care about. Everything above the line was measured. Everything below was deliberately not, and we say why. Alert precision, alert recall, false-alarm rate — all null, because there is no labelled incident set. We found that our replay returns a 100 % detection rate, proved it is circular — the data generator injects the precursor — and withheld it. We would rather show you a gap we found than a number we cannot defend." |

---

## If you have 30 seconds left

Scroll to the evaluation panel and say:

> "Nine numbers measured. Four deliberately withheld, with reasons
> on screen. Thirty-nine claims, each classified against the code."

---

## Anticipated questions

**"Is the 99% a probability?"**
No. It is `RISK SCORE 99.2 / 100`, a weighted sum of parameter
trends. The backend returns `is_probability: false`. There is no
accuracy, precision, recall or F1 figure anywhere in this system,
because none has been measured.

**"How accurate is your risk model?"**
It is a rule set, version `rules-v1` — four thresholds and four
weights, all readable in `ml/risk_engine.py`. Not a trained model,
not calibrated, not validated. The path to a validated model is on
the production validation slide. We did not have time to train one
and we would not have had data to validate it on.

**"Your replay shows 100% detection."**
It does, and we withdrew it. The generator injects the precursor
signature within ±45 m of every event it creates — we measured
ROP at 0.631× baseline against the generator's 0.62× factor. Any
engine "detects" that by construction. The number is in the JSON
as `descriptive_detection_rate`, and `detection_rate` is `null`.

**"How is this different from nearest-neighbour lookup?"**
Measured: 86.7 % of wells rank a non-nearest well first. For this
well, the nearest is WELL-029 at 1.35 km; the engine picks
WELL-017 at 1.38 km. Six weighted factors, each shown with its
own weight and its own derivation.

**"What does it retrieve from?"**
Three narrative DDRs, 3 chunks, 384-d MiniLM embeddings in FAISS.
Hybrid search: 35 % BM25, 65 % cosine, plus formation, event and
depth filters. The corpus is tiny and we say so.

**"Are you connected to eRTMAC / WITSML?"**
No. There is no WITSML or ETP client in this repository. The
WebSocket is real; the data behind it is a recorded CSV. The
production integration path is specified — transport, data
contract, 500 ms latency target, fallback, acknowledgement, audit
trail — and labelled as a path, not as a feature.

**"What is the impact?"**
We do not have an NPT or cost figure and we are not going to
invent one. What we can show is the mechanism: every number is
traceable to a rule, every conclusion to a document, and every
claim on the screen to a classification.

**"What would you do first in production?"**
Get the labelled incident set. Nothing else in the validation plan
matters until an independent dataset exists.

---

## If something breaks

| Symptom | Action |
| --- | --- |
| "Backend unreachable" | Backend is not running. `python -m uvicorn backend.main:app --port 8000` from the project root |
| Panels show loading forever | Backend up but index missing: `curl -X POST localhost:8000/api/rag/build` |
| Offset list empty | `GET /api/wells/WELL-001/offsets` — if that fails, restart the backend |
| Evaluation panel says "not yet generated" | `python -m evaluation.evaluate` — takes ~30 s |
| Demo bar play does nothing | Demo mode must be **SIMULATED**, not REPLAY. REPLAY needs the WebSocket source |

**Never improvise a number on stage.** Every figure in this
script is served live from the running system. If a panel does not
show it, say the panel is not showing it.
