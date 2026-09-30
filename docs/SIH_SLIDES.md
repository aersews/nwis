# NWIS — SIH Submission: 6 Slides

**Problem statement 26121 · eRTMAC-NWIS: AI-Powered Offset Well
Knowledge and Decision Support Platform**

Content only. Each slide states what goes on it, the one thing the
audience must remember, and the diagram to draw. Nothing here
should be pasted as paragraphs — a slide is a claim plus evidence.

**Key message, on every slide's footer:**

> NWIS turns scattered drilling experience into contextual,
> explainable intelligence at the moment of decision.

---

## Design system

| Element | Specification |
| --- | --- |
| Aspect | 16:9 |
| Typeface | Inter (or Arial if Inter is unavailable) |
| Title | 30 pt semibold, #0B1220 on white |
| Body | 16 pt regular, never below 13 pt |
| Caption / source | 11 pt, #64748B |
| Accent — NWIS | #2563EB |
| Semantic — normal | #16A34A |
| Semantic — warning | #D97706 |
| Semantic — critical | #DC2626 |
| Semantic — information | #2563EB |
| Max words per slide | **55** |
| Diagrams | One per slide maximum. No 3-D. No gradients on text. |

**Consistency rules for the build**

- One title style, one body style, one caption style. No slide
  invents a font size.
- Every number on a slide is copied from a running system or from
  `evaluation/results/*.json`. None is typed by hand.
- Arrow diagrams: single direction, no crossing lines, no
  dangling arrows, arrowheads on every connector.
- Terminology is fixed. See the audit at the end of this file.

---

## SLIDE 1 — Problem + NWIS identity

**Title**
Drilling experience is scattered, and the bit does not wait

**Left column — the problem**
- Incident knowledge lives in PDFs, DDRs and one engineer's memory
- The operator holds the offset-well experience of a full field
- That knowledge is not available at the moment of decision
- When it is found, it is often too late to act on

**Right column — the identity**
- **NWIS — Nearby Wells Intelligence System**
- eRTMAC-NWIS: AI-Powered Offset Well Knowledge and Decision
  Support Platform
- Decision support, not autonomous control

**Diagram** — a single horizontal arrow chain, four boxes, no
crossings:

```
SCATTERED EXPERIENCE  →  NO CONTEXT  →  SLOW DECISION  →  NPT
```

**Must land:** the knowledge exists. It is not reachable when it
matters.

---

## SLIDE 2 — Novel solution

**Title**
One question, answered in the order a drilling engineer asks it

**Diagram** — the product loop, vertical, seven stages. This is
the centrepiece diagram of the deck; give it the whole slide body.

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

**Three differentiators, one line each**

- **Not a nearest-well lookup** — six weighted factors; the top
  analogue is not the closest well in 86.7 % of cases *(measured)*
- **Every number is traceable** — score → contribution → document
  → page
- **It shows what it does not know** — missing attributes render
  as "Not available", never as zero

**Must land:** the loop, and the fact that it is explainable at
every step.

---

## SLIDE 3 — Technical architecture

**Title**
A defensible rule-and-retrieval stack, with the evidence layer
exposed

**Diagram** — five horizontal layers, each one line of labels.
No more than six items per layer.

```
STREAM      WebSocket transport · simulated source (prototype)
            WITSML / ETP — production path
──────────────────────────────────────────────────────────
INTELLIGENCE Offset ranking      6 weighted factors, explained
              Depth correlation   MD window in one formation
              Risk engine         4 weighted trends, rules-v1
              Retrieval           BM25 0.35 + cosine 0.65, FAISS
              Alert lifecycle     DETECTED → RESOLVED, validated
──────────────────────────────────────────────────────────
EVIDENCE    Sentence-transformers MiniLM-L6-v2 · 384-d
            FAISS IndexFlatIP, cosine · per-page PDF metadata
            Every citation → source, page, relevance
──────────────────────────────────────────────────────────
INTERFACE   Operations-centre dashboard · why now · why this well
            contributor bars · evidence drawer · lifecycle track
──────────────────────────────────────────────────────────
ASSURANCE   Replay harness · benchmark JSON · claim audit
            Smoke test: 19/19 steps, 0 console errors
```

**Caption**
Current prototype. WITSML/ETP is a production path, not an
implemented integration.

**Must land:** this is engineering, and the evidence layer is
first-class, not an afterthought.

---

## SLIDE 4 — Feasibility: prototype vs production

**Title**
What is built, and what the production system needs

**Two columns. Left is fact; right is design, and must be visibly
marked as design.**

| **CURRENT PROTOTYPE** *(running)* | **PRODUCTION PATH** *(not implemented)* |
| --- | --- |
| Offset ranking, 6 explained factors | Directional survey, MD + TVD + formation tops |
| MD-window correlation in one formation | Stratigraphic correlation framework |
| Rule-based risk index, `rules-v1` | Validated, calibrated ML with uncertainty |
| Simulated telemetry stream | WITSML / ETP ingestion from eRTMAC |
| Hybrid BM25 + vector retrieval | Larger document estate, OCR at scale |
| In-memory alert lifecycle | Durable, actor-attributed audit trail |
| In-process timing measured | 500 ms p95 target under real load |
| — | RBAC, encryption, index versioning, drift detection |

**One line under the table**
> The current risk score is an **explainable 0–100 index**, not a
> probability. It is not calibrated and not validated.

**Must land:** the boundary between what is built and what is
designed is drawn, on purpose, in public.

---

## SLIDE 5 — Impact and measurable validation

**Title**
What we measured — and what we refused to claim

**Top half — MEASURED.** Green figures, each with its denominator.

| Measurement | Result |
| --- | --- |
| Top-ranked offset is **not** the nearest well | **86.7 %** of 30 wells |
| Contributor breakdown reconciles to the score | **1 170 / 1 170** windows |
| Risk engine deterministic on re-score | **1 170 / 1 170** windows |
| Headless smoke test | **19 / 19** steps, 0 console errors |
| Median retrieval latency | ~25 ms |

**Bottom half — NOT MEASURED.** Red figures. This half is the
point of the slide.

| Figure | Status |
| --- | --- |
| Alert precision / recall / false-alarm rate | **Not measured** — no labelled incident set |
| Offset Top-1 / Top-3 relevance | **Not measured** — no engineer-annotated ground truth |
| Median lead time | **Not measured** — no incident timestamps exist |
| Risk accuracy, F1 | **Not measured** — no validation dataset |

**The finding worth stating out loud**
> Replay returned a **100 %** detection rate. We proved it
> circular — the data generator injects the precursor signature
> within ±45 m of every event — and **withheld** it.

**Must land:** the numbers we did not produce. In a competition
this is the differentiator.

---

## SLIDE 6 — Research grounding and references

**Title**
Standing on the standards, not on a benchmark we invented

**Left — standards and prior work the design follows**

| Source | What it contributes |
| --- | --- |
| **WITSML 1.4.1.1 / 2.0** (Energistics) | Drilling data exchange schema — the production data contract |
| **ETP 1.3** (Energistics) | Real-time transfer fallback |
| **IADC / SPE** well-event taxonomies | Stuck-pipe, lost-circulation and kick precursor vocabulary |
| **Okapi / PPSM** | Prefix sums over sliding windows — the rolling-window statistics used in the risk engine |
| **Robertson & Zaragoza (2009)** | The BM25 ranking function, implemented in `rag/rag_engine.py` |
| **Reimers & Gurevych (2019)** | Sentence-BERT — the basis of the `all-MiniLM-L6-v2` embeddings |
| **Johnson, Douze & Jégou (2017)** | FAISS inner-product index — the retrieval store |

**Right — NWIS contribution, stated as design**
- A drilling-domain **hybrid retrieval** layer: BM25 with
  hyphen-aware well-identifier tokenisation and domain synonym
  expansion, combined with vector similarity under formation,
  event and depth filters
- An **offset relevance model whose every term is exposed** to the
  operator, with unavailable attributes reported as unavailable
- A **convergence explanation** assembled clause-by-clause from
  measured values
- A **claim audit** that classifies every system statement
  against the code, served live in the interface

**Footer**
Prototype · synthetic demonstration data · no Oil India Limited or
eRTMAC connection · decision support, not autonomous control

**Must land:** the work is grounded in real standards and
published methods, and the contribution is stated as design, not
as measured novelty.

---

# PPT QUALITY AUDIT

Run this before exporting. It is a checklist against the final
rendered file, not against this document.

## Spelling and acronyms — must be exactly these, everywhere

| Correct | Reject any occurrence of |
| --- | --- |
| eRTMAC | eRTI, ERTMAC, eRTMaC, ertmac |
| NWIS | SWIS, NWlS, NWIS-system, "Nwis" |
| WITSML | WITSMIL, WITSML2, WlTSML, WITS-ML |
| ETP | E.T.P, eTP |
| Nearby Wells Intelligence System | Nearby Well System, "nearby well intel" |
| Technical | TECNICAL, Techncal, Tecnical |
| Stuck Pipe | Stuck pipe (as a category label), "stuck-pipe" as a proper noun |
| Lost Circulation | Mud Loss as a separate category, LCM as an event name |
| Formation-Y | FORMATION-Y, Formation Y |
| BM25 | BM-25, bm25, Okapi BM25 as a separate invention |
| FAISS | Faiss, FAISS index (as two words) |
| DDR | DDF, DDR's |
| NPT | NTP, "non productive time" |
| MiniLM-L6-v2 | MiniLM-L6, all-MiniLM-L6 (missing the "all-") |
| Oil India Limited | OIL, O.I.L, OilIndia |
| Sidereal | — (not used) |

## Numbers — verify each against a live source, not from memory

| Figure | Source of truth |
| --- | --- |
| 86.7 % | `evaluation.json → measured.offset.top1_is_not_nearest_rate` |
| 1 170 / 1 170 | `evaluation.json → measured.risk_engine` |
| 19 / 19 | `smoke.json → steps_passed / steps_total` |
| 0 console errors | `smoke.json → critical_console_errors` |
| ~25 ms retrieval | `evaluation.json → measured.retrieval.median_hybrid_latency_ms` |
| 0.35 / 0.65 | `GET /api/retrieval/config` |
| 39 claims | `GET /api/claim-audit → total_claims` |
| 100 % detection | `replay.json → descriptive_detection_rate` — **only ever labelled as withdrawn** |

Any figure that cannot be read off one of these is a typo.

## Layout checks

- [ ] No text clipped by a slide edge or a shape
- [ ] No two elements overlapping
- [ ] Font sizes consistent within each role across all 6 slides
- [ ] Nothing below 13 pt — legibility from the back of a room
- [ ] Slide 2's 8-box chain fits with visible arrowheads
- [ ] Slide 3's 5 layers are not compressed into unreadable type
- [ ] Slide 4's two columns are visually equal
- [ ] Slide 5's two halves have clearly different treatment
- [ ] Consistent left margin on all 6 slides
- [ ] Slide numbers on all but optionally the first

## Terminology consistency

- [ ] "Risk **score**" or "risk **index**" everywhere — never
      "risk probability", "confidence of failure", "chance of
      failure"
- [ ] "Offset well" — never "nearby well" as the ranking term
      (the panel is titled *Nearby wells*, which is the product
      name, and that is acceptable)
- [ ] "Formation-Y" in the same case on every slide
- [ ] "prototype" in the footer of every slide
- [ ] "decision support" — never "automation", "autonomous",
      "AI decides"

## Claim discipline — the highest-risk section

- [ ] No accuracy, precision, recall or F1 number appears anywhere
- [ ] No NPT, cost or time-saving figure appears anywhere
- [ ] No Oil India Limited real well, formation or incident appears
- [ ] WITSML/ETP always sits in the PRODUCTION PATH column
- [ ] Every "not measured" item is shown as not measured, not
      omitted — omission reads as a claim
- [ ] The withdrawn 100 % detection rate is never shown as a
      success

## Final render pass

1. Export to PDF.
2. Read all 6 slides at 100 % — spell every acronym aloud.
3. Open the exported PDF on a second machine and check the small
   text.
4. Count words per slide; anything over 55 gets cut.
5. Confirm the footer on all 6 slides.
