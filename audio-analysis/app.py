"""Local, offline genre classification for downloaded tracks.

A standalone service (not a subprocess-per-call, unlike this repo's yt-dlp
usage) because the TensorFlow graphs below take real time to load — a
subprocess-per-track approach would pay that cost on every single track,
which is prohibitive across a library backlog of thousands. Loaded once at
startup, then just serves inference requests.

Model: Discogs-EffNet (https://essentia.upf.edu/models.html) — an EfficientNet
embedding extractor plus a classifier head trained on ~400 Discogs
genre/style labels ("Parent---Subgenre"). Genre coverage here comes from the
audio itself, not crowd-sourced tags, which is the whole reason this exists:
MusicBrainz's genre tags are missing for most non-mainstream recordings.
"""

import json
import logging
import os
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("audio-analysis")

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/app/models"))
EMBEDDING_MODEL_PATH = MODEL_DIR / "discogs-effnet-bs64-1.pb"
GENRE_MODEL_PATH = MODEL_DIR / "genre_discogs400-discogs-effnet-1.pb"
GENRE_LABELS_PATH = MODEL_DIR / "genre_discogs400-discogs-effnet-1.json"

# At most this many parent genres, and only ones that clear this score after
# aggregating the ~400 fine-grained classes up to their ~15 parents (see
# analyze() below) — keeps a confidently single-genre track at one tag
# instead of padding it out to 3 with noise.
MAX_PARENT_GENRES = 3
MIN_PARENT_SCORE = 0.12

app = FastAPI(title="audio-analysis")

_mono_loader_cls = None
_embedding_model = None
_genre_model = None
_genre_labels: list[str] = []
_genre_parents: list[str] = []  # same length/order as _genre_labels — each class's parent genre, precomputed once


@app.on_event("startup")
def load_models() -> None:
    # Imported here rather than at module level: importing essentia is what
    # actually loads its (large) native extension, and we want any import
    # failure to surface as a normal startup log rather than crashing before
    # logging is configured.
    from essentia.standard import (
        MonoLoader,
        TensorflowPredict2D,
        TensorflowPredictEffnetDiscogs,
    )

    global _mono_loader_cls, _embedding_model, _genre_model, _genre_labels, _genre_parents

    logger.info("Loading Essentia models from %s", MODEL_DIR)
    _mono_loader_cls = MonoLoader
    _embedding_model = TensorflowPredictEffnetDiscogs(
        graphFilename=str(EMBEDDING_MODEL_PATH), output="PartitionedCall:1"
    )
    _genre_model = TensorflowPredict2D(
        graphFilename=str(GENRE_MODEL_PATH),
        input="serving_default_model_Placeholder",
        output="PartitionedCall:0",
    )
    _genre_labels = json.loads(GENRE_LABELS_PATH.read_text())["classes"]
    _genre_parents = [label.partition("---")[0] for label in _genre_labels]
    logger.info("Models loaded (%d genre classes)", len(_genre_labels))


class AnalyzeRequest(BaseModel):
    path: str


class AnalyzeResponse(BaseModel):
    # Broad parent genres the track scores highly on (e.g. ["Electronic",
    # "Hip Hop"] for a genuine hybrid, or just ["Hip Hop"] when it's not),
    # plus the single most specific style (e.g. "Drum n Bass") appended if
    # it's not already redundant with one of those — see analyze() below.
    genres: list[str]
    confidence: float
    embedding: list[float]


@app.get("/health")
def health():
    return {"status": "ok", "modelsLoaded": _genre_model is not None}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    if _genre_model is None or _embedding_model is None:
        raise HTTPException(status_code=503, detail="Models still loading")
    if not os.path.isfile(req.path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.path}")

    try:
        audio = _mono_loader_cls(filename=req.path, sampleRate=16000, resampleQuality=4)()
        embeddings = _embedding_model(audio)
        predictions = _genre_model(embeddings)
    except Exception as exc:  # noqa: BLE001 — any decode/inference failure means "can't analyze this file"
        logger.exception("Analysis failed for %s", req.path)
        raise HTTPException(status_code=422, detail=f"Analysis failed: {exc}") from exc

    # Both embeddings and predictions are one row per ~2s analysis window
    # across the whole track (EffNet processes overlapping windows, not the
    # track as a single unit) — mean-pool across windows for one track-level
    # result, the standard approach for this model family.
    mean_predictions = np.mean(predictions, axis=0)
    mean_embedding = np.mean(embeddings, axis=0)

    top_idx = int(np.argmax(mean_predictions))
    top_label = _genre_labels[top_idx]
    top_parent, _, top_sub = top_label.partition("---")
    confidence = float(mean_predictions[top_idx])

    # Aggregate the raw ~400-class distribution up to its ~15 parent genres
    # (summing every style's score under its parent) — this is what actually
    # captures a track being genuinely, say, both Electronic and Hip Hop,
    # rather than raw top-K over 400 classes mostly surfacing three adjacent
    # Electronic styles instead.
    parent_scores: dict[str, float] = {}
    for idx, score in enumerate(mean_predictions):
        parent = _genre_parents[idx]
        parent_scores[parent] = parent_scores.get(parent, 0.0) + float(score)

    ranked_parents = sorted(parent_scores.items(), key=lambda kv: kv[1], reverse=True)
    genres = [name for name, score in ranked_parents[:MAX_PARENT_GENRES] if score >= MIN_PARENT_SCORE]
    if not genres:
        genres = [ranked_parents[0][0]]  # always keep at least the strongest genre

    # Add the top-1 prediction's specific style too, unless it's redundant
    # with a parent genre already in the list (Discogs has self-titled
    # styles, e.g. "Classical---Classical", where top_sub == top_parent).
    if top_sub and top_sub not in genres:
        genres.append(top_sub)

    return AnalyzeResponse(
        genres=genres,
        confidence=confidence,
        embedding=mean_embedding.tolist(),
    )
