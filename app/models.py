from sqlalchemy import Column, Integer, String, DateTime, Float, LargeBinary
from sqlalchemy.sql import func
from .database import Base
import json

class Visitor(Base):
    __tablename__ = "visitors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    phone = Column(String, unique=True, index=True)
    email = Column(String, nullable=True)
    # Storing face embedding as a JSON string (list of floats)
    face_embedding = Column(String) 
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class VisitLog(Base):
    __tablename__ = "visit_logs"

    id = Column(Integer, primary_key=True, index=True)
    visitor_id = Column(Integer, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    decision = Column(String) # ALLOW or DENY
    confidence_score = Column(Float)
    image_path = Column(String, nullable=True) # Path to the image used for verification
