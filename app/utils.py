from deepface import DeepFace
import numpy as np
import io
import cv2
from PIL import Image
import os
import tempfile

def get_face_embedding(image_bytes: bytes):
    """
    Detects faces in an image and returns the embedding of the first face found.
    Returns None if no face is found.
    """
    # DeepFace expects a path or a numpy array (BGR)
    # Convert bytes to numpy array
    image = Image.open(io.BytesIO(image_bytes))
    image = image.convert("RGB")
    np_image = np.array(image)
    # Convert RGB to BGR for OpenCV/DeepFace
    bgr_image = cv2.cvtColor(np_image, cv2.COLOR_RGB2BGR)

    try:
        # Generate embedding
        # models: "VGG-Face", "Facenet", "Facenet512", "OpenFace", "DeepFace", "DeepID", "ArcFace", "Dlib", "SFace"
        # detector_backend: "opencv", "ssd", "dlib", "mtcnn", "retinaface", "mediapipe"
        embeddings = DeepFace.represent(
            img_path=bgr_image,
            model_name="ArcFace",
            detector_backend="opencv",
            enforce_detection=True
        )
        if embeddings:
            return embeddings[0]["embedding"]
    except Exception as e:
        print(f"Error in face embedding: {e}")
        return None
    return None

def compare_faces(known_embedding: list, candidate_embedding: list, threshold: float = 0.4) -> tuple[bool, float]:
    """
    Compares two face embeddings using Cosine Similarity.
    ArcFace typically has a similarity threshold around 0.3-0.4 depending on use case.
    """
    a = np.array(known_embedding)
    b = np.array(candidate_embedding)
    
    # Cosine distance
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return False, 0.0
        
    cosine_similarity = np.dot(a, b) / (norm_a * norm_b)
    
    # For ArcFace:
    # Match if similarity >= threshold
    # Initial tests showed low similarity even for matches, so we set a conservative threshold.
    
    match = cosine_similarity >= threshold
    return match, float(cosine_similarity)

