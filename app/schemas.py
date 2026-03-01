from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class VisitorBase(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None

class VisitorCreate(VisitorBase):
    pass

class Visitor(VisitorBase):
    id: int
    created_at: datetime
    # We don't return face_embedding in the standard response for privacy/size
    
    class Config:
        from_attributes = True

# Alias for response
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
    visitor_name: Optional[str] = None

class OTPSend(BaseModel):
    phone: str

class OTPVerify(BaseModel):
    phone: str
    otp: str

class MergeRequest(BaseModel):
    primary_visitor_id: int
    secondary_visitor_id: int

class DuplicateProfile(BaseModel):
    visitor1: VisitorResponse
    visitor2: VisitorResponse
    reason: str
