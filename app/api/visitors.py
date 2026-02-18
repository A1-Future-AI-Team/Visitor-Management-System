from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..models import Visitor, VisitLog
from ..schemas import VisitorCreate, VisitorResponse, CheckInResponse, VisitLogCreate
from ..utils import get_face_embedding, compare_faces
import json
import io
import qrcode

router = APIRouter()

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
    
    # Generate embedding
    embedding = get_face_embedding(content)
    if not embedding:
        raise HTTPException(status_code=400, detail="No face detected in the image")

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
        
    # Generate QR code with visitor ID (and maybe a signature in real app)
    # For now, just the ID
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(str(visitor.id))
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    # Save to bytes
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

    # Read live image
    content = await image.read()
    
    # Get embedding
    live_embedding = get_face_embedding(content)
    if not live_embedding:
         # Log failed attempt (no face)
        log = VisitLog(
            visitor_id=visitor_id,
            decision="DENY",
            confidence_score=0.0,
            image_path="no_face_detected"
        )
        db.add(log)
        db.commit()
        return CheckInResponse(decision="DENY", confidence_score=0.0, message="No face detected in live image")

    # Compare
    stored_embedding = json.loads(visitor.face_embedding)
    match, score = compare_faces(stored_embedding, live_embedding)
    
    decision = "ALLOW" if match else "DENY"
    message = f"Welcome {visitor.name}" if match else "Face verification failed"
    
    # Log visit
    log = VisitLog(
        visitor_id=visitor_id,
        decision=decision,
        confidence_score=score,
        image_path="live_capture_placeholder" # logic to save file not implemented yet
    )
    db.add(log)
    db.commit()
    
    return CheckInResponse(
        decision=decision,
        confidence_score=score,
        message=message,
        visitor_name=visitor.name if match else None
    )
