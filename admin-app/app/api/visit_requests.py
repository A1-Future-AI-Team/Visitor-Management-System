import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..mailer import (
    send_visit_request_approved_email_safe,
    send_visit_request_denied_email_safe,
)
from ..models import Host, Location, Visitor, VisitRequest
from ..schemas import HostCreate, HostResponse, LocationCreate, LocationResponse
from ..security import (
    QR_TOKEN_TTL_HOURS,
    build_qr_image_bytes,
    build_qr_token,
    ensure_utc,
    require_admin_api_key,
    utcnow,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── HTML helpers ─────────────────────────────────────────────────────────────

def _html_page(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f3f0fb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }}
    .card {{
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
    }}
    h1 {{ margin: 0 0 16px; font-size: 24px; color: #1a1a2e; }}
    p {{ color: #555; line-height: 1.6; margin: 0 0 12px; }}
    .badge {{
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
    }}
    .badge.approved {{ background: #d1fae5; color: #065f46; }}
    .badge.denied {{ background: #fee2e2; color: #991b1b; }}
    .badge.pending {{ background: #ede9fe; color: #5b21b6; }}
    textarea {{
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 15px;
      resize: vertical;
      margin: 12px 0;
      min-height: 100px;
      font-family: inherit;
    }}
    .btn {{
      display: inline-block;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      width: 100%;
      box-sizing: border-box;
    }}
    .btn-deny {{ background: #ef4444; color: white; }}
    .btn-deny:hover {{ background: #dc2626; }}
  </style>
</head>
<body>
  <div class="card">
    {body}
  </div>
</body>
</html>"""


# ─── Locations ────────────────────────────────────────────────────────────────

@router.get("/admin/locations", response_model=list[LocationResponse])
def list_locations(
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    return db.query(Location).order_by(Location.name).all()


@router.post("/admin/locations", response_model=LocationResponse)
def create_location(
    body: LocationCreate,
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    loc = Location(**body.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/admin/locations/{location_id}")
def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    db.delete(loc)
    db.commit()
    return {"message": "Location deleted", "status": "success"}


# ─── Hosts ────────────────────────────────────────────────────────────────────

@router.get("/admin/hosts", response_model=list[HostResponse])
def list_hosts(
    location_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    q = db.query(Host)
    if location_id is not None:
        q = q.filter(Host.location_id == location_id)
    return q.order_by(Host.name).all()


@router.post("/admin/hosts", response_model=HostResponse)
def create_host(
    body: HostCreate,
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    loc = db.query(Location).filter(Location.id == body.location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    normalized_email = body.email.strip().lower()
    existing = db.query(Host).filter(Host.email == normalized_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="A host with this email already exists")

    data = body.model_dump()
    data["email"] = normalized_email
    host = Host(**data)
    db.add(host)
    db.commit()
    db.refresh(host)
    return host


@router.patch("/admin/hosts/{host_id}", response_model=HostResponse)
def toggle_host_active(
    host_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    host.is_active = is_active
    db.commit()
    db.refresh(host)
    return host


@router.delete("/admin/hosts/{host_id}")
def delete_host(
    host_id: int,
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    host = db.query(Host).filter(Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    db.delete(host)
    db.commit()
    return {"message": "Host deleted", "status": "success"}


# ─── Visit Requests ────────────────────────────────────────────────────────────

@router.get("/admin/visit-requests")
def list_visit_requests(
    location_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    q = db.query(VisitRequest)
    if location_id is not None:
        q = q.filter(VisitRequest.location_id == location_id)
    if status:
        q = q.filter(VisitRequest.status == status.upper())
    requests = q.order_by(VisitRequest.created_at.desc()).all()

    result = []
    for vr in requests:
        visitor = db.query(Visitor).filter(Visitor.id == vr.visitor_id).first()
        host = db.query(Host).filter(Host.id == vr.host_id).first()
        location = db.query(Location).filter(Location.id == vr.location_id).first()
        result.append({
            "id": vr.id,
            "visitor_id": vr.visitor_id,
            "visitor_name": visitor.name if visitor else "Unknown",
            "visitor_email": visitor.email if visitor else None,
            "host_id": vr.host_id,
            "host_name": host.name if host else "Unknown",
            "location_id": vr.location_id,
            "location_name": location.name if location else "Unknown",
            "purpose": vr.purpose,
            "requested_datetime": vr.requested_datetime,
            "slot_duration_minutes": vr.slot_duration_minutes,
            "status": vr.status,
            "host_remarks": vr.host_remarks,
            "qr_token": vr.qr_token,
            "qr_expires_at": vr.qr_expires_at,
            "created_at": vr.created_at,
            "responded_at": vr.responded_at,
        })
    return result


# ─── Admin override approve / deny ────────────────────────────────────────────

@router.post("/admin/visit-requests/{request_id}/approve")
async def admin_approve_visit(
    request_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    vr = db.query(VisitRequest).filter(VisitRequest.id == request_id).first()
    if not vr:
        raise HTTPException(status_code=404, detail="Visit request not found")
    if vr.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Request is already {vr.status}")

    visitor = db.query(Visitor).filter(Visitor.id == vr.visitor_id).first()
    host = db.query(Host).filter(Host.id == vr.host_id).first()
    location = db.query(Location).filter(Location.id == vr.location_id).first()

    qr_token = build_qr_token(vr.visitor_id)
    qr_expires_at = utcnow() + timedelta(hours=QR_TOKEN_TTL_HOURS)
    qr_png = build_qr_image_bytes(qr_token)

    vr.status = "APPROVED"
    vr.qr_token = qr_token
    vr.qr_expires_at = qr_expires_at
    vr.responded_at = utcnow()
    db.commit()

    dt_label = ensure_utc(vr.requested_datetime).strftime("%A, %d %B %Y at %H:%M UTC")
    visitor_name = visitor.name if visitor else "Visitor"
    host_name = host.name if host else "Host"
    location_name = location.name if location else "Location"

    if visitor and visitor.email:
        background_tasks.add_task(
            send_visit_request_approved_email_safe,
            visitor_email=visitor.email,
            visitor_name=visitor_name,
            host_name=host_name,
            location_name=location_name,
            requested_datetime=dt_label,
            qr_png=qr_png,
        )

    return {"message": "Approved", "status": "APPROVED", "id": vr.id}


class AdminDenyBody(BaseModel):
    remarks: Optional[str] = None


@router.post("/admin/visit-requests/{request_id}/deny")
async def admin_deny_visit(
    request_id: int,
    body: AdminDenyBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _admin_key: str = Depends(require_admin_api_key),
):
    vr = db.query(VisitRequest).filter(VisitRequest.id == request_id).first()
    if not vr:
        raise HTTPException(status_code=404, detail="Visit request not found")
    if vr.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Request is already {vr.status}")

    visitor = db.query(Visitor).filter(Visitor.id == vr.visitor_id).first()
    host = db.query(Host).filter(Host.id == vr.host_id).first()
    location = db.query(Location).filter(Location.id == vr.location_id).first()

    vr.status = "DENIED"
    vr.host_remarks = body.remarks.strip() if body.remarks else None
    vr.responded_at = utcnow()
    db.commit()

    dt_label = ensure_utc(vr.requested_datetime).strftime("%A, %d %B %Y at %H:%M UTC")
    visitor_name = visitor.name if visitor else "Visitor"
    host_name = host.name if host else "Host"
    location_name = location.name if location else "Location"

    if visitor and visitor.email:
        background_tasks.add_task(
            send_visit_request_denied_email_safe,
            visitor_email=visitor.email,
            visitor_name=visitor_name,
            host_name=host_name,
            location_name=location_name,
            requested_datetime=dt_label,
            remarks=body.remarks or "",
        )

    return {"message": "Denied", "status": "DENIED", "id": vr.id}


# ─── Approval / Denial (host-facing HTML pages) ────────────────────────────────

@router.get("/approve/{token}", response_class=HTMLResponse)
async def approve_visit(
    token: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    vr = db.query(VisitRequest).filter(VisitRequest.approval_token == token).first()

    if not vr:
        return HTMLResponse(
            _html_page("Invalid Link", """
              <h1>Link Not Found</h1>
              <span class="badge pending">Invalid</span>
              <p>This approval link is invalid or does not exist.</p>
            """),
            status_code=404,
        )

    if vr.status != "PENDING":
        badge_class = "approved" if vr.status == "APPROVED" else "denied"
        status_label = vr.status.capitalize()
        return HTMLResponse(_html_page("Already Responded", f"""
          <h1>Already Responded</h1>
          <span class="badge {badge_class}">{status_label}</span>
          <p>This visit request has already been {status_label.lower()}.</p>
        """))

    visitor = db.query(Visitor).filter(Visitor.id == vr.visitor_id).first()
    host = db.query(Host).filter(Host.id == vr.host_id).first()
    location = db.query(Location).filter(Location.id == vr.location_id).first()

    qr_token = build_qr_token(vr.visitor_id)
    qr_expires_at = utcnow() + timedelta(hours=QR_TOKEN_TTL_HOURS)
    qr_png = build_qr_image_bytes(qr_token)

    vr.status = "APPROVED"
    vr.qr_token = qr_token
    vr.qr_expires_at = qr_expires_at
    vr.responded_at = utcnow()
    db.commit()

    dt_label = ensure_utc(vr.requested_datetime).strftime("%A, %d %B %Y at %H:%M UTC")
    visitor_name = visitor.name if visitor else "Visitor"
    host_name = host.name if host else "Host"
    location_name = location.name if location else "Location"

    if visitor and visitor.email:
        background_tasks.add_task(
            send_visit_request_approved_email_safe,
            visitor_email=visitor.email,
            visitor_name=visitor_name,
            host_name=host_name,
            location_name=location_name,
            requested_datetime=dt_label,
            qr_png=qr_png,
        )

    return HTMLResponse(_html_page("Visit Approved", f"""
      <h1>Visit Approved ✓</h1>
      <span class="badge approved">Approved</span>
      <p><strong>{visitor_name}</strong> will visit you at <strong>{location_name}</strong>
         on <strong>{dt_label}</strong>.</p>
      <p>The visitor has been notified and their QR code has been emailed to them.</p>
    """))


@router.get("/deny/{token}", response_class=HTMLResponse)
def show_deny_form(token: str, db: Session = Depends(get_db)):
    vr = db.query(VisitRequest).filter(VisitRequest.approval_token == token).first()

    if not vr:
        return HTMLResponse(
            _html_page("Invalid Link", """
              <h1>Link Not Found</h1>
              <span class="badge pending">Invalid</span>
              <p>This link is invalid or does not exist.</p>
            """),
            status_code=404,
        )

    if vr.status != "PENDING":
        badge_class = "approved" if vr.status == "APPROVED" else "denied"
        status_label = vr.status.capitalize()
        return HTMLResponse(_html_page("Already Responded", f"""
          <h1>Already Responded</h1>
          <span class="badge {badge_class}">{status_label}</span>
          <p>This visit request has already been {status_label.lower()}.</p>
        """))

    visitor = db.query(Visitor).filter(Visitor.id == vr.visitor_id).first()
    visitor_name = visitor.name if visitor else "the visitor"

    return HTMLResponse(_html_page("Decline Visit Request", f"""
      <h1>Decline Visit Request</h1>
      <span class="badge denied">Declining</span>
      <p>You are about to decline the visit request from <strong>{visitor_name}</strong>.</p>
      <p>You may optionally provide a reason:</p>
      <form method="POST" action="/deny/{token}">
        <textarea name="remarks" placeholder="Optional: reason for declining..."></textarea>
        <button type="submit" class="btn btn-deny">Decline Visit</button>
      </form>
    """))


@router.post("/deny/{token}", response_class=HTMLResponse)
async def process_deny(
    token: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    remarks: str = Form(default=""),
):
    vr = db.query(VisitRequest).filter(VisitRequest.approval_token == token).first()

    if not vr:
        return HTMLResponse(
            _html_page("Invalid Link", """
              <h1>Link Not Found</h1>
              <span class="badge pending">Invalid</span>
              <p>This link is invalid or does not exist.</p>
            """),
            status_code=404,
        )

    if vr.status != "PENDING":
        badge_class = "approved" if vr.status == "APPROVED" else "denied"
        status_label = vr.status.capitalize()
        return HTMLResponse(_html_page("Already Responded", f"""
          <h1>Already Responded</h1>
          <span class="badge {badge_class}">{status_label}</span>
          <p>This visit request has already been {status_label.lower()}.</p>
        """))

    visitor = db.query(Visitor).filter(Visitor.id == vr.visitor_id).first()
    host = db.query(Host).filter(Host.id == vr.host_id).first()
    location = db.query(Location).filter(Location.id == vr.location_id).first()

    vr.status = "DENIED"
    vr.host_remarks = remarks.strip() or None
    vr.responded_at = utcnow()
    db.commit()

    dt_label = ensure_utc(vr.requested_datetime).strftime("%A, %d %B %Y at %H:%M UTC")
    visitor_name = visitor.name if visitor else "Visitor"
    host_name = host.name if host else "Host"
    location_name = location.name if location else "Location"

    if visitor and visitor.email:
        background_tasks.add_task(
            send_visit_request_denied_email_safe,
            visitor_email=visitor.email,
            visitor_name=visitor_name,
            host_name=host_name,
            location_name=location_name,
            requested_datetime=dt_label,
            remarks=remarks.strip(),
        )

    return HTMLResponse(_html_page("Visit Declined", f"""
      <h1>Visit Declined</h1>
      <span class="badge denied">Declined</span>
      <p>You have declined the visit request from <strong>{visitor_name}</strong>
         at <strong>{location_name}</strong> on <strong>{dt_label}</strong>.</p>
      <p>The visitor has been notified.</p>
    """))
