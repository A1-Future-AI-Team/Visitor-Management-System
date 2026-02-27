from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from sqlalchemy.orm import Session
from typing import Optional, List
from ..database import get_db
from ..models import Visitor, VisitLog
from ..schemas import (
    VisitorCreate, VisitorResponse, CheckInResponse, VisitLogCreate,
    OTPSend, OTPVerify, MergeRequest, DuplicateProfile
)
from ..utils import get_face_embedding, compare_faces
import json
import io
import qrcode
import random

router = APIRouter()

# Mock OTP storage (in-memory for demo)
otp_store = {}

@router.post("/otp/send")
async def send_otp(request: OTPSend):
    # Mock OTP generation - Now 6 digits
    otp = str(random.randint(100000, 999999))
    otp_store[request.phone] = otp
    print(f"MOCK OTP for {request.phone}: {otp}")
    return {"message": "OTP sent successfully (Check console for mock OTP)", "status": "success"}

@router.post("/otp/verify")
async def verify_otp(request: OTPVerify):
    stored_otp = otp_store.get(request.phone)
    if stored_otp and stored_otp == request.otp:
        return {"message": "OTP verified", "status": "success"}
    raise HTTPException(status_code=400, detail="Invalid OTP")

@router.post("/visitors/register", response_model=VisitorResponse)
async def register_visitor(
    name: str = Form(...),
    phone: str = Form(...),
    email: Optional[str] = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # Check if visitor already exists (by phone)
    db_visitor = db.query(Visitor).filter(Visitor.phone == phone).first()
    if db_visitor:
        raise HTTPException(status_code=400, detail="Visitor with this phone number already registered")

    # Read image
    content = await image.read()
    
    # Generate embedding (MOCKED in utils.py)
    embedding = get_face_embedding(content)
    # Even if embedding fails (no bytes), we'll provide a default mock for registration
    if not embedding:
        embedding = [0.0] * 128 

    # Save to DB
    new_visitor = Visitor(
        name=name,
        phone=phone,
        email=email,
        face_embedding=json.dumps(embedding)
    )
    db.add(new_visitor)
    db.commit()
    db.refresh(new_visitor)
    
    return new_visitor

@router.get("/visitors/{visitor_id}/qr")
def generate_qr(visitor_id: int, db: Session = Depends(get_db)):
    visitor = db.query(Visitor).filter(Visitor.id == visitor_id).first()
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
        
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(str(visitor.id))
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    img_byte_arr.seek(0)
    
    return Response(content=img_byte_arr.getvalue(), media_type="image/png")

@router.post("/check-in", response_model=CheckInResponse)
async def check_in(
    visitor_id: int = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    visitor = db.query(Visitor).filter(Visitor.id == visitor_id).first()
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")

    content = await image.read()
    live_embedding = get_face_embedding(content)
    
    # Mocking: If face detection fails, use a mock embedding to allow comparison to proceed
    if not live_embedding:
        live_embedding = [random.uniform(-1, 1) for _ in range(128)]

    stored_embedding = json.loads(visitor.face_embedding)
    match, score = compare_faces(stored_embedding, live_embedding)
    
    decision = "ALLOW" if match else "DENY"
    message = f"Welcome {visitor.name}" if match else "Face verification failed"
    
    log = VisitLog(
        visitor_id=visitor_id,
        decision=decision,
        confidence_score=score,
        image_path="live_capture_placeholder"
    )
    db.add(log)
    db.commit()
    
    return CheckInResponse(
        decision=decision,
        confidence_score=score,
        message=message,
        visitor_name=visitor.name if match else None
    )

# --- Admin APIs ---

@router.get("/admin/visitors", response_model=List[VisitorResponse])
def get_all_visitors(db: Session = Depends(get_db)):
    return db.query(Visitor).all()

@router.get("/admin/logs")
def get_all_logs(db: Session = Depends(get_db)):
    logs = db.query(VisitLog).order_by(VisitLog.timestamp.desc()).all()
    # Manual join for simplicity in demo
    result = []
    for log in logs:
        visitor = db.query(Visitor).filter(Visitor.id == log.visitor_id).first()
        result.append({
            "id": log.id,
            "visitor_id": log.visitor_id,
            "visitor_name": visitor.name if visitor else "Unknown",
            "timestamp": log.timestamp,
            "decision": log.decision,
            "confidence_score": log.confidence_score
        })
    return result

@router.get("/admin/duplicates", response_model=List[DuplicateProfile])
def find_duplicates(db: Session = Depends(get_db)):
    """
    Simple implementation: check for similar names or same email (if provided)
    """
    visitors = db.query(Visitor).all()
    duplicates = []
    seen_pairs = set()

    for i in range(len(visitors)):
        for j in range(i + 1, len(visitors)):
            v1 = visitors[i]
            v2 = visitors[j]
            
            # Simple heuristic: exact name match or same email
            is_dup = False
            reason = ""
            if v1.name.lower() == v2.name.lower():
                is_dup = True
                reason = "Exact Name Match"
            elif v1.email and v2.email and v1.email.lower() == v2.email.lower():
                is_dup = True
                reason = "Same Email"
            
            if is_dup:
                pair = tuple(sorted((v1.id, v2.id)))
                if pair not in seen_pairs:
                    duplicates.append(DuplicateProfile(visitor1=v1, visitor2=v2, reason=reason))
                    seen_pairs.add(pair)
                    
    return duplicates

@router.post("/admin/merge")
def merge_visitors(request: MergeRequest, db: Session = Depends(get_db)):
    primary = db.query(Visitor).filter(Visitor.id == request.primary_visitor_id).first()
    secondary = db.query(Visitor).filter(Visitor.id == request.secondary_visitor_id).first()
    
    if not primary or not secondary:
        raise HTTPException(status_code=404, detail="One or both visitors not found")

    # 1. Update logs from secondary to primary
    db.query(VisitLog).filter(VisitLog.visitor_id == secondary.id).update({"visitor_id": primary.id})
    
    # 2. Delete secondary
    db.delete(secondary)
    db.commit()
    
    return {"message": f"Successfully merged visitor {secondary.id} into {primary.id}", "status": "success"}
