from pathlib import Path
import json
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

def extract_pdf_text(path):

    doc = pymupdf.open(str(path))

    pages = []

    for page_number, page in enumerate(doc):

        text = page.get_text("text").strip()

        # ---------------------------------------
        # Normal text-based PDF
        # ---------------------------------------

        if len(text) >= 40:

            pages.append(text)

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

                pages.append(
                    ocr_text
                )

        except Exception as error:

            print(
                f"OCR failed on "
                f"page {page_number + 1}: "
                f"{error}"
            )

    doc.close()

    return "\n".join(pages)

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
            formation_match.group(1)
            if formation_match
            else "UNKNOWN",

        "event":
            event_match.group(1).strip()
            if event_match
            else "UNKNOWN"

    }


# =========================================================
# BUILD CORPUS
# =========================================================

def load_documents():

    documents = []

    for path in sorted(DOCS_DIR.iterdir()):

        if path.suffix.lower() not in [
            ".txt",
            ".md",
            ".pdf"
        ]:

            continue

        print(
            f"Processing: {path.name}"
        )

        text = extract_document(path)

        if not text.strip():
            continue

        metadata = extract_metadata(
            path.name,
            text
        )

        chunks = chunk_text(text)

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
