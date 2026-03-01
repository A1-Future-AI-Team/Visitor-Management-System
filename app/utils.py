import numpy as np
import io
import random

def get_face_embedding(image_bytes: bytes):
    """
    MOCK: Detects faces in an image and returns a dummy embedding.
    In a real app, this would use DeepFace.
    """
    # Simulate processing time
    # In a real scenario, we'd check if a face exists.
    # For mock, we'll just return a random 128-dimensional vector if bytes exist.
    if not image_bytes:
        return None
        
    # Seed with some property of the image to keep it "somewhat" consistent if needed
    # but for now, just random.
    return [random.uniform(-1, 1) for _ in range(128)]

def compare_faces(known_embedding: list, candidate_embedding: list, threshold: float = 0.4) -> tuple[bool, float]:
    """
    MOCK: Compares two face embeddings using Cosine Similarity.
    """
    a = np.array(known_embedding)
    b = np.array(candidate_embedding)
    
    # Cosine distance
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return False, 0.0
        
    cosine_similarity = np.dot(a, b) / (norm_a * norm_b)
    
    # For mock purposes, let's make it highly likely to match if they are roughly similar
    # or just use the threshold.
    match = cosine_similarity >= threshold
    return match, float(cosine_similarity)

