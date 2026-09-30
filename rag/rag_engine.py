from pathlib import Path
import json
import math
import re

import numpy as np
import faiss
import pymupdf
import pytesseract

from PIL import Image
from io import BytesIO

from sentence_transformers import SentenceTransformer
from pypdf import PdfReader


BASE_DIR = Path(__file__).resolve().parents[1]

DATA_DIR = BASE_DIR / "data"
DOCS_DIR = DATA_DIR / "documents"

INDEX_FILE = DATA_DIR / "rag.index"
METADATA_FILE = DATA_DIR / "rag_metadata.json"

DOCS_DIR.mkdir(
    parents=True,
    exist_ok=True
)


MODEL_NAME = "all-MiniLM-L6-v2"


# =========================================================
# HYBRID RETRIEAL CONFIGURATION
#
# Documented here rather than in the UI so the reported
# numbers can be reproduced. These are the settings the
# evaluation script measures against.
# =========================================================

HYBRID_CONFIG = {
    "lexical_weight": 0.35,
    "vector_weight": 0.65,
    "bm25_k1": 1.5,
    "bm25_b": 0.75,
    "vector_metric": "cosine (normalised inner product)",
    "ranking_note": (
        "Hybrid score = 0.35 x BM25-normalised lexical "
        "+ 0.65 x cosine vector similarity. Metadata, "
        "depth and formation filters are applied as hard "
        "pre-filters before scoring; a soft depth proximity "
        "bonus is applied afterwards."
    )
}


_model = None


def get_model():

    global _model

    if _model is None:

        print(
            f"Loading embedding model: {MODEL_NAME}"
        )

        _model = SentenceTransformer(
            MODEL_NAME
        )

    return _model


# =========================================================
# TEXT EXTRACTION
# =========================================================

def extract_pdf_pages(path):

    doc = pymupdf.open(str(path))

    pages = []

    for page_number, page in enumerate(doc, start=1):

        text = page.get_text("text").strip()

        # ---------------------------------------
        # Normal text-based PDF
        # ---------------------------------------

        if len(text) >= 40:

            pages.append({
                "page": page_number,
                "text": text,
                "extraction": "text-layer"
            })

            continue

        # ---------------------------------------
        # Scanned/image PDF → OCR
        # ---------------------------------------

        try:

            pix = page.get_pixmap(
                matrix=pymupdf.Matrix(2, 2),
                alpha=False
            )

            image = Image.open(
                BytesIO(
                    pix.tobytes("png")
                )
            )

            ocr_text = pytesseract.image_to_string(
                image
            )

            if ocr_text.strip():

                pages.append({
                    "page": page_number,
                    "text": ocr_text,
                    "extraction": "ocr"
                })

        except Exception as error:

            print(
                f"OCR failed on "
                f"page {page_number}: "
                f"{error}"
            )

    doc.close()

    return pages


def extract_pdf_text(path):
    """Flat text of a PDF. Kept for backward compatibility."""

    return "\n".join(
        page["text"] for page in extract_pdf_pages(path)
    )

def extract_document(path):

    suffix = path.suffix.lower()

    if suffix == ".pdf":

        return extract_pdf_text(path)

    if suffix in [".txt", ".md"]:

        return path.read_text(
            encoding="utf-8",
            errors="ignore"
        )

    return ""


# =========================================================
# CLEANING
# =========================================================

def clean_text(text):

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


# =========================================================
# CHUNKING
# =========================================================

def chunk_text(
    text,
    chunk_size=800,
    overlap=120
):

    text = clean_text(text)

    chunks = []

    start = 0

    while start < len(text):

        end = min(
            start + chunk_size,
            len(text)
        )

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= len(text):
            break

        start = end - overlap

    return chunks


# =========================================================
# METADATA EXTRACTION
# =========================================================

def canonical_formation(value):
    """Match the well table's vocabulary.

    Metadata is extracted from an upper-cased string, so a
    formation read out of a document arrives as
    "FORMATION-Y" while wells.csv writes "Formation-Y".
    Left unreconciled, any formation filter silently matches
    nothing. Both stores therefore speak one vocabulary.
    """

    if not isinstance(value, str) or not value.strip():

        return "UNKNOWN"

    return "-".join(
        part.capitalize()
        for part in value.strip().split("-")
    )


def canonical_event(value):
    """Match the event table's vocabulary ("Stuck Pipe",
    "Lost Circulation", "Kick")."""

    if not isinstance(value, str) or not value.strip():

        return "UNKNOWN"

    cleaned = re.sub(
        r"\s+", " ", value.strip()
    ).lower()

    aliases = {
        "mud loss": "Lost Circulation",
        "mud losses": "Lost Circulation",
        "lost circulation": "Lost Circulation",
        "stuck pipe": "Stuck Pipe",
        "stuck-pipe": "Stuck Pipe",
        "pack off": "Stuck Pipe",
        "packoff": "Stuck Pipe",
        "kick": "Kick",
        "well control event": "Kick"
    }

    if cleaned in aliases:

        return aliases[cleaned]

    return cleaned.title()


def canonical_severity(value):
    if not isinstance(value, str) or not value.strip():

        return "UNKNOWN"

    return value.strip().capitalize()


def extract_metadata(
    filename,
    text
):

    upper = text.upper()

    well_match = re.search(
        r"WELL\s*[:#-]?\s*([A-Z0-9_-]+)",
        upper
    )

    depth_match = re.search(
        r"(?:DEPTH|MD)\s*[:=]?\s*"
        r"([0-9]+(?:\.[0-9]+)?)",
        upper
    )

    formation_match = re.search(
        r"FORMATION\s*[:=]?\s*"
        r"([A-Z0-9_-]+)",
        upper
    )

    event_match = re.search(
        r"(?:EVENT|INCIDENT)\s*[:=]?\s*"
        r"([A-Z][A-Z ]+)",
        upper
    )

    # -------------------------------------------
    # Additional structured fields.
    #
    # Present in the demonstration DDRs but not captured
    # by the original four fields. Anything absent stays
    # None — never a guessed value.
    # -------------------------------------------

    severity_match = re.search(
        r"SEVERITY\s*[:=]?\s*"
        r"([A-Z]+)",
        upper
    )

    date_match = re.search(
        r"DATE\s*[:=]?\s*"
        r"(\d{4}-\d{2}-\d{2})",
        upper
    )

    mitigation_match = re.search(
        r"MITIGATION\s*:(.*?)(?:LESSON|\Z)",
        text,
        re.S | re.I
    )

    lesson_match = re.search(
        r"LESSON\s+LEARNED\s*:(.*)\Z",
        text,
        re.S | re.I
    )

    def _section(regex):
        if not regex:
            return None
        body = re.sub(
            r"\s+", " ", regex.group(1)
        ).strip()
        return body or None

    raw_event = (
        event_match.group(1).strip()
        if event_match
        else "UNKNOWN"
    )

    raw_formation = (
        formation_match.group(1)
        if formation_match
        else "UNKNOWN"
    )

    return {

        "source": filename,

        "well_id":
            well_match.group(1)
            if well_match
            else "UNKNOWN",

        "depth":
            float(depth_match.group(1))
            if depth_match
            else None,

        "formation":
            canonical_formation(raw_formation),

        "formation_raw": raw_formation,

        "event":
            canonical_event(raw_event),

        "event_raw": raw_event,

        "severity":
            canonical_severity(
                severity_match.group(1)
                if severity_match
                else "UNKNOWN"
            ),

        "date":
            date_match.group(1)
            if date_match
            else None,

        "mitigation":
            _section(mitigation_match),

        "lesson_learned":
            _section(lesson_match)
    }


# =========================================================
# BUILD CORPUS
# =========================================================

def load_documents():

    documents = []

    for path in sorted(DOCS_DIR.iterdir()):

        suffix = path.suffix.lower()

        if suffix not in [".txt", ".md", ".pdf"]:

            continue

        print(
            f"Processing: {path.name}"
        )

        # -------------------------------------------
        # PDF is chunked per page so every chunk can
        # carry a real page reference. Plain text and
        # markdown have no page concept, so their page
        # stays None and the UI reports it as
        # unavailable rather than inventing one.
        # -------------------------------------------

        if suffix == ".pdf":

            units = [
                {
                    "page": page["page"],
                    "text": page["text"],
                    "extraction": page["extraction"]
                }
                for page in extract_pdf_pages(path)
                if page["text"].strip()
            ]

        else:

            text = extract_document(path)

            if not text.strip():

                continue

            units = [{
                "page": None,
                "text": text,
                "extraction": "text"
            }]

        for unit in units:

            if not unit["text"].strip():

                continue

            metadata = extract_metadata(
                path.name,
                unit["text"]
            )

            metadata["page"] = unit["page"]

            metadata["page_available"] = (
                unit["page"] is not None
            )

            metadata["extraction"] = unit["extraction"]

            chunks = chunk_text(unit["text"])

            for i, chunk in enumerate(chunks):

                documents.append({

                    "id":
                        f"{path.stem}-{i}",

                    "text":
                        chunk,

                    "metadata":
                        metadata
                })

    return documents


# =========================================================
# BUILD FAISS INDEX
# =========================================================

def build_index():

    documents = load_documents()

    if not documents:

        return {
            "status": "EMPTY",
            "documents": 0
        }

    model = get_model()

    texts = [
        doc["text"]
        for doc in documents
    ]

    print(
        f"Creating embeddings for "
        f"{len(texts)} chunks..."
    )

    embeddings = model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=True
    )

    embeddings = embeddings.astype(
        np.float32
    )

    dimension = embeddings.shape[1]

    index = faiss.IndexFlatIP(
        dimension
    )

    index.add(embeddings)

    faiss.write_index(
        index,
        str(INDEX_FILE)
    )

    METADATA_FILE.write_text(
        json.dumps(
            documents,
            indent=2
        ),
        encoding="utf-8"
    )

    print(
        f"FAISS index created: "
        f"{index.ntotal} vectors"
    )

    return {

        "status": "INDEXED",

        "documents":
            len(documents),

        "vectors":
            index.ntotal,

        "dimension":
            dimension

    }


# =========================================================
# LOAD INDEX
# =========================================================

def load_index():

    if not INDEX_FILE.exists():

        build_index()

    if not INDEX_FILE.exists():

        return None, []

    index = faiss.read_index(
        str(INDEX_FILE)
    )

    documents = json.loads(
        METADATA_FILE.read_text(
            encoding="utf-8"
        )
    )

    return index, documents


# =========================================================
# SEMANTIC SEARCH
# =========================================================

def search_documents(
    query,
    top_k=5
):

    index, documents = load_index()

    if index is None:

        return []

    model = get_model()

    query_embedding = model.encode(
        [query],
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    query_embedding = query_embedding.astype(
        np.float32
    )

    scores, indices = index.search(
        query_embedding,
        min(top_k, len(documents))
    )

    results = []

    for score, idx in zip(
        scores[0],
        indices[0]
    ):

        if idx < 0:
            continue

        doc = documents[idx]

        results.append({

            "id":
                doc["id"],

            "relevance":
                round(
                    float(score),
                    4
                ),

            "text":
                doc["text"],

            "metadata":
                doc["metadata"]

        })

    return results


# =========================================================
# HYBRID RETRIEVAL
#
# Lexical (BM25) + vector (FAISS cosine) with drilling-domain
# metadata filters. Deliberately dependency-free: a full
# search engine is not warranted for a three-document
# demonstration corpus, and a light hybrid is enough to
# show the architecture honestly.
# =========================================================

_TOKEN = re.compile(
    r"[A-Z0-9]+(?:-[A-Z0-9]+)*"
)

# Domain terms that carry signal even when the operator
# does not type them. Weighted into the lexical query.
DOMAIN_TERMS = {
    "stuck pipe": "stuck pipe",
    "lost circulation": "lost circulation",
    "mud loss": "lost circulation",
    "kick": "kick",
    "pack-off": "stuck pipe",
    "packoff": "stuck pipe",
    "precursor": "torque",
    "backreaming": "backreaming",
    "lcm": "lcm treatment",
    "lesson learned": "lesson learned",
    "mitigation": "mitigation",
    "severity": "severity",
    "formation": "formation",
    "depth": "depth"
}

_STOPWORDS = {
    "a", "an", "the", "of", "and", "or", "in", "on", "at",
    "to", "for", "with", "by", "is", "are", "was", "were",
    "be", "as", "it", "this", "that", "from", "near",
    "around", "about", "through", "while", "during"
}


def tokenize(text):
    """Domain-aware tokenizer.

    Splits on non-alphanumerics but keeps hyphenated well
    identifiers intact, because WELL-017 is one term and
    breaking it would destroy the strongest lexical signal
    in a drilling corpus.
    """

    if not isinstance(text, str):

        return []

    return [
        token.lower()
        for token in _TOKEN.findall(text.upper())
        if token.lower() not in _STOPWORDS
    ]


def build_query_terms(query, well_id=None, formation=None):
    """Query tokens plus the domain synonyms a drilling
    operator would use but might not type."""

    terms = tokenize(query)

    if well_id:

        terms.append(str(well_id).lower())

    if formation:

        terms.append(str(formation).lower())

    lowered = str(query or "").lower()

    for needle, expansion in DOMAIN_TERMS.items():

        if needle in lowered:

            terms.extend(tokenize(expansion))

    # Preserve order, drop duplicates.
    seen = set()
    unique = []

    for term in terms:

        if term and term not in seen:

            seen.add(term)
            unique.append(term)

    return unique


def bm25_scores(query_terms, documents):
    """Standard BM25 over the whole chunk store.

    Returns a list of raw BM25 scores aligned with
    `documents`. This is textbook Robertson/Sparck-Jones
    IDF with the k1/b parameters in HYBRID_CONFIG — no
    external search dependency.
    """

    if not documents:

        return []

    k1 = HYBRID_CONFIG["bm25_k1"]
    b = HYBRID_CONFIG["bm25_b"]

    tokenised = [
        tokenize(doc.get("text", "")) for doc in documents
    ]

    lengths = [len(t) for t in tokenised]
    total_length = sum(lengths) or 1
    average_length = total_length / len(tokenised)

    frequencies = []

    for tokens in tokenised:

        counts = {}
        for token in tokens:

            counts[token] = counts.get(token, 0) + 1

        frequencies.append(counts)

    document_frequency = {}

    for term in set(query_terms):

        document_frequency[term] = sum(
            1 for counts in frequencies
            if term in counts
        )

    total_documents = len(documents)

    scores = []

    for index, counts in enumerate(frequencies):

        score = 0.0

        for term in query_terms:

            frequency = counts.get(term, 0)

            if frequency == 0:

                continue

            df = document_frequency.get(term, 0)

            idf = math.log(
                1
                + (
                    (total_documents - df + 0.5)
                    / (df + 0.5)
                )
            )

            denominator = (
                frequency
                + k1 * (
                    1
                    - b
                    + b * (
                        lengths[index]
                        / average_length
                    )
                )
            )

            score += idf * (
                frequency * (k1 + 1) / denominator
            )

        scores.append(score)

    return scores


def _metadata_filter(
    documents,
    well_id=None,
    formation=None,
    event_type=None,
    min_depth=None,
    max_depth=None,
    depth_window_m=None,
    reference_depth=None
):
    """Hard pre-filter plus a recorded soft depth window.

    A chunk is rejected only when a field the operator
    explicitly constrained contradicts the chunk. Chunks
    whose depth is unknown are never rejected on depth —
    an unrecorded depth is not a mismatching depth.
    """

    kept = []
    rejected = {
        "well_id": 0,
        "formation": 0,
        "event": 0,
        "depth": 0
    }

    # Comparisons are case-insensitive on both sides. The
    # document store and the well table are separate
    # ingests with different capitalisation conventions,
    # and a case-sensitive match would reject everything.
    wanted_well = str(well_id).upper() if well_id else None
    wanted_formation = (
        canonical_formation(formation).upper()
        if formation else None
    )
    wanted_event = str(event_type).lower() if event_type else None

    for doc in documents:

        metadata = doc.get("metadata", {})

        if wanted_well:

            if str(
                metadata.get("well_id") or ""
            ).upper() not in (wanted_well, "UNKNOWN"):

                rejected["well_id"] += 1
                continue

        if wanted_formation:

            if str(
                metadata.get("formation") or ""
            ).upper() not in (wanted_formation, "UNKNOWN"):

                rejected["formation"] += 1
                continue

        if wanted_event:

            event_value = str(
                metadata.get("event") or ""
            ).lower()

            if (
                event_value not in ("unknown", "")
                and wanted_event not in event_value
                and event_value not in wanted_event
            ):

                rejected["event"] += 1
                continue

        depth = metadata.get("depth")

        if depth_window_m is not None and reference_depth is not None:

            if (
                isinstance(depth, (int, float))
                and abs(depth - reference_depth)
                > depth_window_m
            ):

                rejected["depth"] += 1
                continue

        elif min_depth is not None or max_depth is not None:

            if isinstance(depth, (int, float)):

                if min_depth is not None and depth < min_depth:

                    rejected["depth"] += 1
                    continue

                if max_depth is not None and depth > max_depth:

                    rejected["depth"] += 1
                    continue

        kept.append(doc)

    return kept, rejected


def _depth_proximity_bonus(
    metadata,
    reference_depth,
    window_m
):
    """Soft bonus, 0..1, for a chunk whose recorded depth is
    close to the current bit position. Returns None when no
    depth is available, so no bonus is invented."""

    if reference_depth is None or window_m is None:

        return None

    depth = metadata.get("depth")

    if not isinstance(depth, (int, float)):

        return None

    difference = abs(depth - reference_depth)

    if difference >= window_m:

        return 0.0

    return round(1 - difference / window_m, 4)


def hybrid_search(
    query,
    top_k=5,
    well_id=None,
    formation=None,
    event_type=None,
    reference_depth=None,
    depth_window_m=None,
    min_depth=None,
    max_depth=None,
    mode="hybrid"
):
    """Rank chunks by lexical + vector similarity under
    drilling-domain metadata filters.

    mode:
      "hybrid"  — 0.35 x BM25 + 0.65 x cosine  (default)
      "vector"  — cosine only (the original behaviour)
      "lexical" — BM25 only

    Every returned score is a *similarity*, never a
    probability.
    """

    index, documents = load_index()

    if index is None or not documents:

        return []

    lexical_weight = (
        HYBRID_CONFIG["lexical_weight"]
        if mode == "hybrid" else 0.0
    )

    vector_weight = (
        HYBRID_CONFIG["vector_weight"]
        if mode == "hybrid" else 1.0
    )

    # -------------------------------------------
    # HARD METADATA FILTERS
    # -------------------------------------------

    candidates, rejected = _metadata_filter(
        documents,
        well_id=well_id,
        formation=formation,
        event_type=event_type,
        min_depth=min_depth,
        max_depth=max_depth,
        depth_window_m=depth_window_m,
        reference_depth=reference_depth
    )

    if not candidates:

        return []

    # -------------------------------------------
    # VECTOR SCORES
    # -------------------------------------------

    model = get_model()

    query_embedding = model.encode(
        [query],
        convert_to_numpy=True,
        normalize_embeddings=True
    ).astype(np.float32)

    # Search the whole index, then keep only the chunks
    # that survived the filters. The corpus is small; this
    # keeps the FAISS code path unchanged.
    search_k = min(len(documents), max(top_k * 6, 40))

    scores, indices = index.search(query_embedding, search_k)

    vector_by_id = {}

    for score, idx in zip(scores[0], indices[0]):

        if idx < 0:

            continue

        vector_by_id[documents[idx]["id"]] = float(score)

    # -------------------------------------------
    # LEXICAL SCORES
    # -------------------------------------------

    query_terms = build_query_terms(
        query,
        well_id=well_id,
        formation=formation
    )

    raw_bm25 = bm25_scores(query_terms, candidates)

    max_bm25 = max(raw_bm25) if raw_bm25 else 0.0

    lexical_by_position = {
        id(doc): (
            raw_bm25[i] / max_bm25 if max_bm25 > 0 else 0.0
        )
        for i, doc in enumerate(candidates)
    }

    # -------------------------------------------
    # FUSE
    # -------------------------------------------

    results = []

    for doc in candidates:

        metadata = doc.get("metadata", {})

        vector_raw = vector_by_id.get(doc["id"])

        vector_norm = (
            None
            if vector_raw is None
            else round(max(0.0, min(1.0, vector_raw)), 4)
        )

        lexical_norm = round(
            lexical_by_position.get(id(doc), 0.0), 4
        )

        if vector_norm is None:

            hybrid = lexical_weight * lexical_norm
            base_norm = lexical_norm

        else:

            hybrid = (
                vector_weight * vector_norm
                + lexical_weight * lexical_norm
            )

            base_norm = (
                vector_norm + lexical_norm
            ) / 2.0

        depth_bonus = _depth_proximity_bonus(
            metadata,
            reference_depth,
            depth_window_m
        )

        final = (
            base_norm + 0.10 * depth_bonus
            if depth_bonus
            else base_norm
        )

        results.append({
            "id": doc["id"],
            "relevance": round(final, 4),
            "hybrid_score": round(hybrid, 4),
            "vector_score": vector_norm,
            "lexical_score": lexical_norm,
            "depth_bonus": depth_bonus,
            "text": doc["text"],
            "metadata": metadata,
            "retrieval": {
                "mode": mode,
                "lexical_weight": lexical_weight,
                "vector_weight": vector_weight,
                "vector_metric": HYBRID_CONFIG["vector_metric"],
                "vector_candidate": vector_norm is not None
            }
        })

    results.sort(
        key=lambda r: r["relevance"],
        reverse=True
    )

    return results[:top_k]


def search_documents_legacy(query, top_k=5):
    """Original vector-only search, preserved for
    reproducibility of the pre-hybrid baseline."""

    return search_documents(query, top_k)
