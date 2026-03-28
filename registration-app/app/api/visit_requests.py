import logging
import os
import secrets
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..mailer import (
    send_host_approval_request_email_safe,
    send_visit_request_pending_email_safe,
)
from ..models import Host, Location, Visitor, VisitRequest
from ..schemas import HostResponse, LocationResponse, VisitRequestCreate, VisitRequestResponse
from ..security import ensure_utc

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/locations", response_model=list[LocationResponse])
def list_locations(db: Session = Depends(get_db)):
    return db.query(Location).order_by(Location.name).all()


@router.get("/hosts", response_model=list[HostResponse])
def list_hosts(location_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Host).filter(Host.is_active == True)  # noqa: E712
    if location_id is not None:
        q = q.filter(Host.location_id == location_id)
    return q.order_by(Host.name).all()


@router.post("/visit-requests", response_model=VisitRequestResponse)
async def create_visit_request(
    body: VisitRequestCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    visitor = db.query(Visitor).filter(Visitor.id == body.visitor_id).first()
    if not visitor:
        raise HTTPException(status_code=404, detail="Visitor not found")

    host = db.query(Host).filter(Host.id == body.host_id, Host.is_active == True).first()  # noqa: E712
    if not host:
        raise HTTPException(status_code=404, detail="Host not found or inactive")

    if host.location_id != body.location_id:
        raise HTTPException(status_code=400, detail="Host does not belong to the specified location")

    location = db.query(Location).filter(Location.id == body.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # Calendar conflict check — no overlapping PENDING/APPROVED slots for the same host
    new_start = ensure_utc(body.requested_datetime)
    new_end = new_start + timedelta(minutes=30)

    existing_requests = (
        db.query(VisitRequest)
        .filter(
            VisitRequest.host_id == host.id,
            VisitRequest.status.in_(["PENDING", "APPROVED"]),
        )
        .all()
    )
    for existing in existing_requests:
        ex_start = ensure_utc(existing.requested_datetime)
        ex_end = ex_start + timedelta(minutes=existing.slot_duration_minutes)
        if new_start < ex_end and ex_start < new_end:
            raise HTTPException(
                status_code=409,
                detail="This host already has a visit scheduled at this time. Please select a different slot.",
            )

    approval_token = secrets.token_urlsafe(32)

    visit_request = VisitRequest(
        visitor_id=visitor.id,
        host_id=host.id,
        location_id=location.id,
        purpose=body.purpose.strip(),
        requested_datetime=new_start,
        slot_duration_minutes=30,
        status="PENDING",
        approval_token=approval_token,
    )
    db.add(visit_request)
    db.commit()
    db.refresh(visit_request)

    approval_base_url = os.getenv("APPROVAL_BASE_URL", "http://localhost:8002")
    approve_url = f"{approval_base_url}/approve/{approval_token}"
    deny_url = f"{approval_base_url}/deny/{approval_token}"
    dt_label = new_start.strftime("%A, %d %B %Y at %H:%M UTC")

    background_tasks.add_task(
        send_host_approval_request_email_safe,
        host_email=host.email,
        host_name=host.name,
        visitor_name=visitor.name,
        visitor_email=visitor.email,
        purpose=body.purpose.strip(),
        requested_datetime=dt_label,
        location_name=location.name,
        approve_url=approve_url,
        deny_url=deny_url,
    )

    if visitor.email:
        background_tasks.add_task(
            send_visit_request_pending_email_safe,
            visitor_email=visitor.email,
            visitor_name=visitor.name,
            host_name=host.name,
            location_name=location.name,
            purpose=body.purpose.strip(),
            requested_datetime=dt_label,
        )

    return visit_request
