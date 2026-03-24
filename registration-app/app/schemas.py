from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr


class VisitorBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None


class VisitorCreate(VisitorBase):
    verification_token: str


class Visitor(BaseModel):
    id: int
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class VisitorResponse(Visitor):
    pass


class VisitLogBase(BaseModel):
    visitor_id: int
    decision: str
    confidence_score: float


class VisitLogCreate(VisitLogBase):
    pass


class VisitLog(VisitLogBase):
    id: int
    timestamp: datetime
    image_path: Optional[str] = None

    class Config:
        from_attributes = True


class CheckInResponse(BaseModel):
    decision: str
    confidence_score: float
    message: str
    visitor_id: Optional[int] = None
    visitor_name: Optional[str] = None


class OTPSend(BaseModel):
    email: EmailStr


class OTPVerify(BaseModel):
    email: EmailStr
    otp: str


class OTPVerifyResponse(BaseModel):
    message: str
    status: str
    verification_token: str


class QRResolveRequest(BaseModel):
    token: str


class MergeRequest(BaseModel):
    primary_visitor_id: int
    secondary_visitor_id: int


class DuplicateScores(BaseModel):
    name_score: float
    phone_score: float
    face_score: Optional[float] = None
    combined_score: float


class DuplicateProfile(BaseModel):
    visitor1: VisitorResponse
    visitor2: VisitorResponse
    reasons: List[str]
    scores: DuplicateScores
