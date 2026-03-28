from sqlalchemy import Column, DateTime, Float, Integer, String
from sqlalchemy.sql import func

from .database import Base


class Visitor(Base):
    __tablename__ = "visitors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    phone = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    face_embedding = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class VisitLog(Base):
    __tablename__ = "visit_logs"

    id = Column(Integer, primary_key=True, index=True)
    visitor_id = Column(Integer, index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    decision = Column(String, nullable=False)
    confidence_score = Column(Float, nullable=False)
    image_path = Column(String, nullable=True)


class OTPChallenge(Base):
    __tablename__ = "otp_challenges"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    purpose = Column(String, index=True, nullable=False)
    otp_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    attempt_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
