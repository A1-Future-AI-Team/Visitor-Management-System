import os
import re
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from insightface.app import FaceAnalysis
from rapidfuzz import fuzz

DEFAULT_MODEL_ROOT = Path(__file__).resolve().parents[1] / ".cache" / "insightface"
FACE_MODEL_NAME = os.getenv("FACE_MODEL_NAME", "buffalo_sc")
FACE_MODEL_ROOT = os.getenv("INSIGHTFACE_MODEL_ROOT", str(DEFAULT_MODEL_ROOT))
FACE_PROVIDER = os.getenv("FACE_EXECUTION_PROVIDER", "CPUExecutionProvider")
FACE_DET_SIZE = int(os.getenv("FACE_DET_SIZE", "640"))
FACE_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.35"))
FACE_DUPLICATE_THRESHOLD = float(os.getenv("FACE_DUPLICATE_THRESHOLD", "0.6"))
NAME_DUPLICATE_THRESHOLD = float(os.getenv("NAME_DUPLICATE_THRESHOLD", "0.88"))
PHONE_DUPLICATE_THRESHOLD = float(os.getenv("PHONE_DUPLICATE_THRESHOLD", "0.75"))
FACE_EMBEDDING_DIM = int(os.getenv("FACE_EMBEDDING_DIM", "512"))


class FaceRecognitionError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def get_face_analyzer() -> FaceAnalysis:
    try:
        Path(FACE_MODEL_ROOT).mkdir(parents=True, exist_ok=True)
        analyzer = FaceAnalysis(
            name=FACE_MODEL_NAME,
            root=FACE_MODEL_ROOT,
            providers=[FACE_PROVIDER],
            allowed_modules=["detection", "recognition"],
        )
        analyzer.prepare(ctx_id=-1, det_size=(FACE_DET_SIZE, FACE_DET_SIZE))
        return analyzer
    except Exception as exc:
        raise FaceRecognitionError(
            "Failed to initialize the face recognition engine. "
            "Confirm InsightFace dependencies are installed and the model pack can be downloaded."
        ) from exc


def placeholder_embedding() -> list[float]:
    return [0.0] * FACE_EMBEDDING_DIM


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.strip().lower().split())


def normalize_phone(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\D+", "", value)


def text_similarity(left: str | None, right: str | None) -> float:
    normalized_left = normalize_text(left)
    normalized_right = normalize_text(right)
    if not normalized_left or not normalized_right:
        return 0.0
    return fuzz.WRatio(normalized_left, normalized_right) / 100.0


def phone_similarity(left: str | None, right: str | None) -> float:
    normalized_left = normalize_phone(left)
    normalized_right = normalize_phone(right)
    if not normalized_left or not normalized_right:
        return 0.0
    return fuzz.ratio(normalized_left, normalized_right) / 100.0


def _decode_image(image_bytes: bytes) -> np.ndarray:
    if not image_bytes:
        raise ValueError("No image bytes were provided.")

    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unable to decode the uploaded image.")
    return image


def _select_primary_face(faces: list) -> object | None:
    if not faces:
        return None

    return max(
        faces,
        key=lambda face: float((face.bbox[2] - face.bbox[0]) * (face.bbox[3] - face.bbox[1])),
    )


def get_face_embedding(image_bytes: bytes) -> list[float]:
    image = _decode_image(image_bytes)
    analyzer = get_face_analyzer()
    faces = analyzer.get(image)
    face = _select_primary_face(faces)

    if face is None:
        raise ValueError("No face detected in the uploaded image.")

    embedding = np.asarray(face.normed_embedding, dtype=np.float32)
    norm = np.linalg.norm(embedding)
    if norm == 0:
        raise ValueError("The detected face did not produce a valid embedding.")

    return (embedding / norm).tolist()


def embedding_similarity(known_embedding: list[float], candidate_embedding: list[float]) -> float | None:
    a = np.asarray(known_embedding, dtype=np.float32)
    b = np.asarray(candidate_embedding, dtype=np.float32)

    if a.shape != b.shape:
        return None

    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return None

    return float(np.dot(a, b) / (norm_a * norm_b))


def compare_faces(
    known_embedding: list[float],
    candidate_embedding: list[float],
    threshold: float | None = None,
) -> tuple[bool, float]:
    cosine_similarity = embedding_similarity(known_embedding, candidate_embedding)
    if cosine_similarity is None:
        return False, -1.0

    active_threshold = FACE_MATCH_THRESHOLD if threshold is None else threshold
    return cosine_similarity >= active_threshold, cosine_similarity
