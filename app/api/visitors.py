import json
import logging
import os
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..mailer import (
    MailConfigError,
    send_otp_email,
    send_registration_confirmation_email,
    send_registration_confirmation_email_safe,
)
from ..models import OTPChallenge, VisitLog, Visitor
from ..schemas import (
    CheckInResponse,
    DuplicateProfile,
    DuplicateScores,
    MergeRequest,
    OTPSend,
    OTPVerify,
    OTPVerifyResponse,
    QRResolveRequest,
    VisitorResponse,
)
from ..security import (
    OTP_PURPOSE_REGISTRATION,
    OTP_TTL_MINUTES,
    QR_TOKEN_TTL_HOURS,
    TokenValidationError,
    build_qr_image_bytes,
    build_qr_token,
    build_registration_verification_token,
    ensure_utc,
    generate_otp,
    hash_otp,
    resolve_qr_token,
    utcnow,
    validate_registration_verification_token,
    verify_hashed_otp,
)
from ..utils import (
    FACE_DUPLICATE_THRESHOLD,
    NAME_DUPLICATE_THRESHOLD,
    PHONE_DUPLICATE_THRESHOLD,
    FaceRecognitionError,
    compare_faces,
    embedding_similarity,
    get_face_embedding,
    normalize_phone,
    text_similarity,
    phone_similarity,
)

logger = logging.getLogger(__name__)
router = APIRouter()
MAX_OTP_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))


def _build_check_response(decision: str, score: float, message: str, visitor: Visitor | None) -> CheckInResponse:
    return CheckInResponse(
        decision=decision,
        confidence_score=score,
        message=message,
        visitor_id=visitor.id if visitor else None,
        visitor_name=visitor.name if visitor else None,
    )


async def _extract_embedding(image: UploadFile) -> list[float]:
    content = await image.read()
    try:
        return get_face_embedding(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FaceRecognitionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _get_visitor_by_id(visitor_id: int, db: Session) -> Visitor:
    visitor = db.query(Visitor).filter(Visitor.id == visitor_id).first()
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")
    return visitor


def _get_registration_qr_artifacts(visitor_id: int) -> tuple[str, bytes]:
    qr_token = build_qr_token(visitor_id)
    qr_png = build_qr_image_bytes(qr_token)
    return qr_token, qr_png


def _score_duplicate_pair(visitor1: Visitor, visitor2: Visitor) -> DuplicateProfile | None:
    name_score = text_similarity(visitor1.name, visitor2.name)
    phone_score = phone_similarity(visitor1.phone, visitor2.phone)
    face_score = embedding_similarity(
        json.loads(visitor1.face_embedding),
        json.loads(visitor2.face_embedding),
    )

    reasons: list[str] = []
    same_email = bool(visitor1.email and visitor2.email and visitor1.email.strip().lower() == visitor2.email.strip().lower())

    if name_score >= NAME_DUPLICATE_THRESHOLD:
        reasons.append("High name similarity")
    if phone_score >= PHONE_DUPLICATE_THRESHOLD:
        reasons.append("High phone similarity")
    if face_score is not None and face_score >= FACE_DUPLICATE_THRESHOLD:
        reasons.append("High face similarity")
    if same_email:
        reasons.append("Same email")

    suggested = same_email or (
        face_score is not None and face_score >= FACE_DUPLICATE_THRESHOLD
    ) or (
        name_score >= NAME_DUPLICATE_THRESHOLD and phone_score >= PHONE_DUPLICATE_THRESHOLD
    )

    if not suggested:
        return None

    combined_score = max(
        face_score if face_score is not None else 0.0,
        (name_score + phone_score) / 2,
        0.95 if same_email else 0.0,
    )

    return DuplicateProfile(
        visitor1=VisitorResponse.model_validate(visitor1),
        visitor2=VisitorResponse.model_validate(visitor2),
        reasons=reasons,
        scores=DuplicateScores(
            name_score=name_score,
            phone_score=phone_score,
            face_score=face_score,
            combined_score=combined_score,
        ),
    )


@router.post("/otp/send")
async def send_otp(request: OTPSend, db: Session = Depends(get_db)):
    email = _normalize_email(request.email)
    now = utcnow()

    active_challenges = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.email == email,
            OTPChallenge.purpose == OTP_PURPOSE_REGISTRATION,
            OTPChallenge.consumed_at.is_(None),
            OTPChallenge.expires_at > now,
        )
        .all()
    )
    for challenge in active_challenges:
        challenge.consumed_at = now

    otp = generate_otp()
    challenge = OTPChallenge(
        email=email,
        purpose=OTP_PURPOSE_REGISTRATION,
        otp_hash=hash_otp(email=email, purpose=OTP_PURPOSE_REGISTRATION, otp=otp),
        expires_at=now + timedelta(minutes=OTP_TTL_MINUTES),
        attempt_count=0,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    try:
        await send_otp_email(email=email, otp=otp, expires_at=challenge.expires_at)
    except MailConfigError as exc:
        challenge.consumed_at = utcnow()
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        challenge.consumed_at = utcnow()
        db.commit()
        logger.exception("Failed to send OTP email to %s", email)
        raise HTTPException(status_code=502, detail="Failed to send OTP email.") from exc

    return {"message": "OTP sent to email.", "status": "success"}


@router.post("/otp/verify", response_model=OTPVerifyResponse)
async def verify_otp(request: OTPVerify, db: Session = Depends(get_db)):
    email = _normalize_email(request.email)
    now = utcnow()
    challenge = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.email == email,
            OTPChallenge.purpose == OTP_PURPOSE_REGISTRATION,
            OTPChallenge.consumed_at.is_(None),
        )
        .order_by(OTPChallenge.created_at.desc(), OTPChallenge.id.desc())
        .first()
    )

    if challenge is None:
        raise HTTPException(status_code=400, detail="OTP has expired. Request a new code.")

    challenge_expires_at = ensure_utc(challenge.expires_at)
    if challenge_expires_at <= now:
        challenge.consumed_at = now
        db.commit()
        raise HTTPException(status_code=400, detail="OTP has expired. Request a new code.")

    if challenge.attempt_count >= MAX_OTP_ATTEMPTS:
        challenge.consumed_at = now
        db.commit()
        raise HTTPException(status_code=400, detail="Too many invalid attempts. Request a new OTP.")

    challenge.attempt_count += 1
    if not verify_hashed_otp(email=email, purpose=OTP_PURPOSE_REGISTRATION, otp=request.otp, stored_hash=challenge.otp_hash):
        if challenge.attempt_count >= MAX_OTP_ATTEMPTS:
            challenge.consumed_at = now
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid OTP")

    challenge.consumed_at = now
    db.commit()

    return OTPVerifyResponse(
        message="OTP verified",
        status="success",
        verification_token=build_registration_verification_token(email),
    )


@router.post("/visitors/register", response_model=VisitorResponse)
async def register_visitor(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    email: str = Form(...),
    phone: Optional[str] = Form(None),
    verification_token: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    normalized_email = _normalize_email(email)
    normalized_phone = normalize_phone(phone)

    try:
        validate_registration_verification_token(verification_token, normalized_email)
    except TokenValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing_email = db.query(Visitor).filter(func.lower(Visitor.email) == normalized_email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Visitor with this email address is already registered")

    if normalized_phone:
        existing_phone = db.query(Visitor).filter(Visitor.phone == normalized_phone).first()
        if existing_phone:
            raise HTTPException(status_code=400, detail="Visitor with this phone number is already registered")

    embedding = await _extract_embedding(image)

    new_visitor = Visitor(
        name=name.strip(),
        email=normalized_email,
        phone=normalized_phone or None,
        face_embedding=json.dumps(embedding),
    )
    db.add(new_visitor)
    db.commit()
    db.refresh(new_visitor)

    _, qr_png = _get_registration_qr_artifacts(new_visitor.id)
    background_tasks.add_task(
        send_registration_confirmation_email_safe,
        email=normalized_email,
        visitor_name=new_visitor.name,
        visitor_id=new_visitor.id,
        qr_png=qr_png,
        qr_expires_in_hours=QR_TOKEN_TTL_HOURS,
    )

    return new_visitor


@router.get("/visitors/{visitor_id}", response_model=VisitorResponse)
def get_visitor(visitor_id: int, db: Session = Depends(get_db)):
    return _get_visitor_by_id(visitor_id, db)


@router.get("/visitors/{visitor_id}/qr")
def generate_qr(visitor_id: int, db: Session = Depends(get_db)):
    _get_visitor_by_id(visitor_id, db)
    qr_token, qr_png = _get_registration_qr_artifacts(visitor_id)
    return Response(content=qr_png, media_type="image/png", headers={"X-QR-Token": qr_token})


@router.post("/qr/resolve", response_model=VisitorResponse)
def resolve_qr(request: QRResolveRequest, db: Session = Depends(get_db)):
    try:
        visitor_id = resolve_qr_token(request.token)
    except TokenValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _get_visitor_by_id(visitor_id, db)


@router.post("/check-in", response_model=CheckInResponse)
async def check_in(
    visitor_id: int = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    visitor = _get_visitor_by_id(visitor_id, db)

    live_embedding = await _extract_embedding(image)
    stored_embedding = json.loads(visitor.face_embedding)
    match, score = compare_faces(stored_embedding, live_embedding)

    decision = "ALLOW" if match else "DENY"
    message = f"Welcome {visitor.name}" if match else "Face verification failed"

    log = VisitLog(
        visitor_id=visitor_id,
        decision=decision,
        confidence_score=score,
        image_path=None,
    )
    db.add(log)
    db.commit()

    return _build_check_response(decision, score, message, visitor if match else None)


@router.post("/identify", response_model=CheckInResponse)
async def identify_visitor(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    live_embedding = await _extract_embedding(image)
    visitors = db.query(Visitor).all()
    if not visitors:
        raise HTTPException(status_code=404, detail="No registered visitors available for identification")

    best_visitor: Visitor | None = None
    best_score = float("-inf")
    best_match = False

    for visitor in visitors:
        stored_embedding = json.loads(visitor.face_embedding)
        match, score = compare_faces(stored_embedding, live_embedding)
        if score > best_score:
            best_score = score
            best_match = match
            best_visitor = visitor

    if not best_match or best_visitor is None:
        return _build_check_response(
            decision="DENY",
            score=best_score if best_score != float("-inf") else 0.0,
            message="No matching visitor found",
            visitor=None,
        )

    log = VisitLog(
        visitor_id=best_visitor.id,
        decision="ALLOW",
        confidence_score=best_score,
        image_path=None,
    )
    db.add(log)
    db.commit()

    return _build_check_response(
        decision="ALLOW",
        score=best_score,
        message=f"Identified {best_visitor.name}",
        visitor=best_visitor,
    )


@router.get("/admin/visitors", response_model=List[VisitorResponse])
def get_all_visitors(db: Session = Depends(get_db)):
    return db.query(Visitor).order_by(Visitor.created_at.desc(), Visitor.id.desc()).all()


@router.post("/admin/visitors/{visitor_id}/email-qr")
async def resend_qr_email(visitor_id: int, db: Session = Depends(get_db)):
    visitor = _get_visitor_by_id(visitor_id, db)
    if not visitor.email:
        raise HTTPException(status_code=400, detail="Visitor does not have an email address on file.")

    _, qr_png = _get_registration_qr_artifacts(visitor.id)

    try:
        await send_registration_confirmation_email(
            email=visitor.email,
            visitor_name=visitor.name,
            visitor_id=visitor.id,
            qr_png=qr_png,
            qr_expires_in_hours=QR_TOKEN_TTL_HOURS,
        )
    except MailConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to resend QR email for visitor_id=%s", visitor.id)
        raise HTTPException(status_code=502, detail="Failed to send QR email.") from exc

    return {"message": "QR email sent successfully.", "status": "success"}


@router.get("/admin/logs")
def get_all_logs(db: Session = Depends(get_db)):
    logs = db.query(VisitLog).order_by(VisitLog.timestamp.desc()).all()
    result = []
    for log in logs:
        visitor = db.query(Visitor).filter(Visitor.id == log.visitor_id).first()
        result.append(
            {
                "id": log.id,
                "visitor_id": log.visitor_id,
                "visitor_name": visitor.name if visitor else "Unknown",
                "timestamp": log.timestamp,
                "decision": log.decision,
                "confidence_score": log.confidence_score,
            }
        )
    return result


@router.get("/admin/duplicates", response_model=List[DuplicateProfile])
def find_duplicates(db: Session = Depends(get_db)):
    visitors = db.query(Visitor).all()
    duplicates: list[DuplicateProfile] = []

    for i in range(len(visitors)):
        for j in range(i + 1, len(visitors)):
            duplicate = _score_duplicate_pair(visitors[i], visitors[j])
            if duplicate:
                duplicates.append(duplicate)

    duplicates.sort(key=lambda item: item.scores.combined_score, reverse=True)
    return duplicates


@router.post("/admin/merge")
def merge_visitors(request: MergeRequest, db: Session = Depends(get_db)):
    primary = db.query(Visitor).filter(Visitor.id == request.primary_visitor_id).first()
    secondary = db.query(Visitor).filter(Visitor.id == request.secondary_visitor_id).first()

    if not primary or not secondary:
        raise HTTPException(status_code=404, detail="One or both visitors not found")

    db.query(VisitLog).filter(VisitLog.visitor_id == secondary.id).update({"visitor_id": primary.id})
    db.delete(secondary)
    db.commit()

    return {"message": f"Successfully merged visitor {secondary.id} into {primary.id}", "status": "success"}

