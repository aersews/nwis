# NWIS — References

Sources the design follows. Each entry states **what it
contributes** and **where it is used in this repository**, so a
reviewer can check the claim rather than take it on trust.

These are cited as **design context**. No experiment reproducing any
of them was run in this repository, and no result from any of them
is claimed as NWIS's own.

---

## Standards

**WITSML 1.4.1.1 and 2.0 — Energistics**
Data Transfer Standard for well drilling and completion.
*Contributes:* the channel vocabulary and the drilling data
contract that the production ingestion path targets
(`depth`, `rop`, `torque`, `ecd`, `pitVolume`, with MD/TVD
references and a wellbore identity).
*Used in:* the production integration design in
`docs/ARCHITECTURE.md` §4. **No WITSML client is implemented
here.**

**ETP 1.3 — Energistics**
Energistics Transfer Protocol.
*Contributes:* the real-time transport fallback when a full
WITSML session is impractical.
*Used in:* `docs/ARCHITECTURE.md` §4. **Not implemented.**

---

## Well-event taxonomy

**IADC / SPE well-control and drilling incident terminology**
*Contributes:* the precursor and event vocabulary the rule set is
written against — rate-of-penetration decline, torque and drag
increase, ECD rise, pit-volume deviation as precursors to stuck
pipe, lost circulation and kick.
*Used in:* `ml/risk_engine.RISK_MODEL` thresholds and labels;
`backend/recommendations.py` event keywords.
*Note:* the vocabulary is applied at the level of operator-facing
labels. The demonstration dataset uses the three event types
`Stuck Pipe`, `Lost Circulation` and `Kick` only.

---

## Methods actually implemented

**Robertson, S. & Zaragoza, H. (2009)**
*The Probabilistic Relevance Framework: BM25 and Beyond.*
*Contributes:* the BM25 ranking function — term saturation, length
normalisation, IDF.
*Implemented in:* `rag/rag_engine.bm25_scores`, with
`k1 = 1.5`, `b = 0.75` from `HYBRID_CONFIG`. Textbook
Robertson/Sparck-Jones IDF, no search dependency.

**Reimers, N. & Gurevych, I. (2019)**
*Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks.*
*Contributes:* the sentence-embedding approach that makes
semantic retrieval over short incident passages practical.
*Used in:* the `sentence-transformers` `all-MiniLM-L6-v2`
checkpoint — a **pretrained** model. It is not trained, fine-tuned
or evaluated on NWIS data.

**Johnson, J., Douze, M. & Jégou, H. (2017)**
*Billion-scale similarity search with GPUs.*
*Contributes:* FAISS, the vector index used for retrieval.
*Used in:* `rag/rag_engine.build_index` — `IndexFlatIP` over
L2-normalised embeddings, giving an inner product that equals
cosine similarity.

**Cormode, G. & Muthukrishnan, S. (2005)**
*What is Data Engineering?* (Dahan, Cohen, Vernadat, Wornell, eds.)
*Contributes:* the end-to-end data-engineering framing —
normalisation, feature extraction and serving as distinct
stages, with the interface and the data contract treated as part
of the system.
*Used in:* the layer structure of `docs/ARCHITECTURE.md` §3–4.

---

## The circularity finding

Not an external source — a result from this repository, and the
most important caveat in it.

`data/generate_demo_data.py` injects a precursor fingerprint
within ±45 m of every event depth it writes:

```python
if event_depth and abs(depth - event_depth) < 45:
    rop    *= 0.62
    torque *= 1.55
    ecd    += 0.08
    pit    -= 5
```

`evaluation/replay.py → verify_circularity()` measures the
fingerprint in the data rather than trusting the source, and finds
ROP at **0.631×** baseline against the generator's 0.62× factor in
**15 of 15** event-bearing wells.

**Consequence:** any engine replayed against this pair detects
every event by construction. The measured detection rate of 1.0
is a property of the data generator, and is therefore withheld
from `detection_rate` in `evaluation/results/replay.json`.

This is why no accuracy figure appears anywhere in NWIS, and why
the production validation path begins with obtaining an
independent labelled dataset rather than with a better model.
