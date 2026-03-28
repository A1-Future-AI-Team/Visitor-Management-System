import logging
import os
from datetime import datetime
from functools import lru_cache
from io import BytesIO

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from fastapi_mail.schemas import MultipartSubtypeEnum
from starlette.datastructures import Headers, UploadFile

from .security import ensure_utc

logger = logging.getLogger(__name__)


class MailConfigError(RuntimeError):
    pass


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_mail_config() -> ConnectionConfig:
    required = {
        "MAIL_SERVER": os.getenv("MAIL_SERVER"),
        "MAIL_PORT": os.getenv("MAIL_PORT"),
        "MAIL_USERNAME": os.getenv("MAIL_USERNAME"),
        "MAIL_PASSWORD": os.getenv("MAIL_PASSWORD"),
        "MAIL_FROM": os.getenv("MAIL_FROM"),
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise MailConfigError(
            "Mail configuration is incomplete. Set: " + ", ".join(missing)
        )

    return ConnectionConfig(
        MAIL_SERVER=required["MAIL_SERVER"],
        MAIL_PORT=int(required["MAIL_PORT"]),
        MAIL_USERNAME=required["MAIL_USERNAME"],
        MAIL_PASSWORD=required["MAIL_PASSWORD"],
        MAIL_FROM=required["MAIL_FROM"],
        MAIL_FROM_NAME=os.getenv("MAIL_FROM_NAME", "Visitor Management System"),
        MAIL_STARTTLS=_parse_bool(os.getenv("MAIL_STARTTLS"), True),
        MAIL_SSL_TLS=_parse_bool(os.getenv("MAIL_SSL_TLS"), False),
        VALIDATE_CERTS=_parse_bool(os.getenv("MAIL_VALIDATE_CERTS"), True),
        USE_CREDENTIALS=True,
        SUPPRESS_SEND=0,
    )


async def _send_message(message: MessageSchema) -> None:
    config = get_mail_config()
    mail = FastMail(config)
    await mail.send_message(message)


async def send_otp_email(email: str, otp: str, expires_at: datetime) -> None:
    expires_at = ensure_utc(expires_at)
    expiry_label = expires_at.strftime("%Y-%m-%d %H:%M UTC")
    plain_body = (
        "Your Visitor Management System verification code is "
        f"{otp}. It expires at {expiry_label}."
    )
    html_body = (
        "<p>Your Visitor Management System verification code is "
        f"<strong>{otp}</strong>.</p>"
        f"<p>It expires at <strong>{expiry_label}</strong>.</p>"
    )
    message = MessageSchema(
        recipients=[email],
        subject="Your verification code",
        body=plain_body,
        alternative_body=html_body,
        subtype=MessageType.plain,
        multipart_subtype=MultipartSubtypeEnum.alternative,
    )
    await _send_message(message)


async def send_registration_confirmation_email(
    email: str,
    visitor_name: str,
    visitor_id: int,
    qr_png: bytes,
    qr_expires_in_hours: int,
) -> None:
    attachment = {
        "file": UploadFile(
            filename=f"visitor-{visitor_id}-qr.png",
            file=BytesIO(qr_png),
            headers=Headers({"content-type": "image/png"}),
        ),
        "mime_type": "image",
        "mime_subtype": "png",
    }

    plain_body = (
        f"Hello {visitor_name},\n\n"
        f"Your visitor registration is complete. Visitor ID: {visitor_id}.\n"
        f"The attached QR code is valid for approximately {qr_expires_in_hours} hours.\n"
        "Please present this QR code to security during check-in."
    )
    html_body = (
        f"<p>Hello {visitor_name},</p>"
        f"<p>Your visitor registration is complete. <strong>Visitor ID: {visitor_id}</strong>.</p>"
        f"<p>The attached QR code is valid for approximately <strong>{qr_expires_in_hours} hours</strong>.</p>"
        "<p>Please present this QR code to security during check-in.</p>"
    )

    message = MessageSchema(
        recipients=[email],
        subject="Your visitor QR code",
        body=plain_body,
        alternative_body=html_body,
        attachments=[attachment],
        subtype=MessageType.plain,
        multipart_subtype=MultipartSubtypeEnum.alternative,
    )
    await _send_message(message)


async def send_registration_confirmation_email_safe(
    email: str,
    visitor_name: str,
    visitor_id: int,
    qr_png: bytes,
    qr_expires_in_hours: int,
) -> None:
    try:
        await send_registration_confirmation_email(
            email=email,
            visitor_name=visitor_name,
            visitor_id=visitor_id,
            qr_png=qr_png,
            qr_expires_in_hours=qr_expires_in_hours,
        )
    except Exception:
        logger.exception("Failed to send registration confirmation email for visitor_id=%s", visitor_id)


async def send_host_approval_request_email(
    host_email: str,
    host_name: str,
    visitor_name: str,
    visitor_email: str,
    purpose: str,
    requested_datetime: str,
    location_name: str,
    approve_url: str,
    deny_url: str,
) -> None:
    plain_body = (
        f"Hello {host_name},\n\n"
        f"{visitor_name} ({visitor_email}) has requested to visit you at {location_name} "
        f"on {requested_datetime}.\n\n"
        f"Purpose: {purpose}\n\n"
        f"Approve this visit:\n{approve_url}\n\n"
        f"Decline this visit:\n{deny_url}\n\n"
        "These links can only be used once."
    )
    html_body = (
        f"<p>Hello {host_name},</p>"
        f"<p><strong>{visitor_name}</strong> ({visitor_email}) has requested to visit you at "
        f"<strong>{location_name}</strong> on <strong>{requested_datetime}</strong>.</p>"
        f"<p><strong>Purpose:</strong> {purpose}</p>"
        f"<p style='margin-top:24px;'>"
        f"<a href='{approve_url}' style='display:inline-block;padding:12px 24px;background:#16a34a;"
        f"color:white;text-decoration:none;border-radius:8px;font-weight:600;margin-right:12px;'>"
        f"✓ Approve Visit</a>"
        f"<a href='{deny_url}' style='display:inline-block;padding:12px 24px;background:#dc2626;"
        f"color:white;text-decoration:none;border-radius:8px;font-weight:600;'>"
        f"✗ Decline Visit</a></p>"
        f"<p style='color:#888;font-size:13px;margin-top:16px;'>These links can only be used once.</p>"
    )
    message = MessageSchema(
        recipients=[host_email],
        subject=f"Visit Request — {visitor_name} on {requested_datetime}",
        body=plain_body,
        alternative_body=html_body,
        subtype=MessageType.plain,
        multipart_subtype=MultipartSubtypeEnum.alternative,
    )
    await _send_message(message)


async def send_host_approval_request_email_safe(
    host_email: str,
    host_name: str,
    visitor_name: str,
    visitor_email: str,
    purpose: str,
    requested_datetime: str,
    location_name: str,
    approve_url: str,
    deny_url: str,
) -> None:
    try:
        await send_host_approval_request_email(
            host_email=host_email,
            host_name=host_name,
            visitor_name=visitor_name,
            visitor_email=visitor_email,
            purpose=purpose,
            requested_datetime=requested_datetime,
            location_name=location_name,
            approve_url=approve_url,
            deny_url=deny_url,
        )
    except Exception:
        logger.exception("Failed to send host approval request email to %s", host_email)


async def send_visit_request_pending_email(
    visitor_email: str,
    visitor_name: str,
    host_name: str,
    location_name: str,
    purpose: str,
    requested_datetime: str,
) -> None:
    plain_body = (
        f"Hello {visitor_name},\n\n"
        f"Your visit request has been submitted and is awaiting approval.\n\n"
        f"Host: {host_name}\n"
        f"Location: {location_name}\n"
        f"Date/Time: {requested_datetime}\n"
        f"Purpose: {purpose}\n\n"
        "You will receive another email once your host responds."
    )
    html_body = (
        f"<p>Hello {visitor_name},</p>"
        f"<p>Your visit request has been submitted and is <strong>awaiting approval</strong>.</p>"
        f"<table style='border-collapse:collapse;margin:16px 0;'>"
        f"<tr><td style='padding:6px 16px 6px 0;color:#888;'>Host</td>"
        f"<td style='padding:6px 0;font-weight:600;'>{host_name}</td></tr>"
        f"<tr><td style='padding:6px 16px 6px 0;color:#888;'>Location</td>"
        f"<td style='padding:6px 0;font-weight:600;'>{location_name}</td></tr>"
        f"<tr><td style='padding:6px 16px 6px 0;color:#888;'>Date/Time</td>"
        f"<td style='padding:6px 0;font-weight:600;'>{requested_datetime}</td></tr>"
        f"<tr><td style='padding:6px 16px 6px 0;color:#888;'>Purpose</td>"
        f"<td style='padding:6px 0;'>{purpose}</td></tr>"
        f"</table>"
        f"<p>You will receive another email once your host responds.</p>"
    )
    message = MessageSchema(
        recipients=[visitor_email],
        subject="Visit request submitted — pending approval",
        body=plain_body,
        alternative_body=html_body,
        subtype=MessageType.plain,
        multipart_subtype=MultipartSubtypeEnum.alternative,
    )
    await _send_message(message)


async def send_visit_request_pending_email_safe(
    visitor_email: str,
    visitor_name: str,
    host_name: str,
    location_name: str,
    purpose: str,
    requested_datetime: str,
) -> None:
    try:
        await send_visit_request_pending_email(
            visitor_email=visitor_email,
            visitor_name=visitor_name,
            host_name=host_name,
            location_name=location_name,
            purpose=purpose,
            requested_datetime=requested_datetime,
        )
    except Exception:
        logger.exception("Failed to send visit request pending email to %s", visitor_email)
