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


async def send_visit_request_approved_email(
    visitor_email: str,
    visitor_name: str,
    host_name: str,
    location_name: str,
    requested_datetime: str,
    qr_png: bytes,
) -> None:
    attachment = {
        "file": UploadFile(
            filename="visit-qr.png",
            file=BytesIO(qr_png),
            headers=Headers({"content-type": "image/png"}),
        ),
        "mime_type": "image",
        "mime_subtype": "png",
    }
    plain_body = (
        f"Hello {visitor_name},\n\n"
        f"Great news! {host_name} has approved your visit to {location_name} "
        f"on {requested_datetime}.\n\n"
        "Your QR code is attached. Please present it at the security desk when you arrive."
    )
    html_body = (
        f"<p>Hello {visitor_name},</p>"
        f"<p>Great news! <strong>{host_name}</strong> has approved your visit to "
        f"<strong>{location_name}</strong> on <strong>{requested_datetime}</strong>.</p>"
        f"<p>Your QR code is attached. Please present it at the security desk when you arrive.</p>"
    )
    message = MessageSchema(
        recipients=[visitor_email],
        subject=f"Visit approved — {requested_datetime}",
        body=plain_body,
        alternative_body=html_body,
        attachments=[attachment],
        subtype=MessageType.plain,
        multipart_subtype=MultipartSubtypeEnum.alternative,
    )
    await _send_message(message)


async def send_visit_request_approved_email_safe(
    visitor_email: str,
    visitor_name: str,
    host_name: str,
    location_name: str,
    requested_datetime: str,
    qr_png: bytes,
) -> None:
    try:
        await send_visit_request_approved_email(
            visitor_email=visitor_email,
            visitor_name=visitor_name,
            host_name=host_name,
            location_name=location_name,
            requested_datetime=requested_datetime,
            qr_png=qr_png,
        )
    except Exception:
        logger.exception("Failed to send visit approved email to %s", visitor_email)


async def send_visit_request_denied_email(
    visitor_email: str,
    visitor_name: str,
    host_name: str,
    location_name: str,
    requested_datetime: str,
    remarks: str,
) -> None:
    remarks_section = f"\n\nReason: {remarks}" if remarks.strip() else ""
    plain_body = (
        f"Hello {visitor_name},\n\n"
        f"Unfortunately, {host_name} has declined your visit request to {location_name} "
        f"on {requested_datetime}.{remarks_section}\n\n"
        "Please contact the host directly if you have questions."
    )
    remarks_html = (
        f"<p><strong>Reason:</strong> {remarks}</p>" if remarks.strip() else ""
    )
    html_body = (
        f"<p>Hello {visitor_name},</p>"
        f"<p>Unfortunately, <strong>{host_name}</strong> has declined your visit request to "
        f"<strong>{location_name}</strong> on <strong>{requested_datetime}</strong>.</p>"
        f"{remarks_html}"
        f"<p>Please contact the host directly if you have questions.</p>"
    )
    message = MessageSchema(
        recipients=[visitor_email],
        subject=f"Visit request declined — {requested_datetime}",
        body=plain_body,
        alternative_body=html_body,
        subtype=MessageType.plain,
        multipart_subtype=MultipartSubtypeEnum.alternative,
    )
    await _send_message(message)


async def send_visit_request_denied_email_safe(
    visitor_email: str,
    visitor_name: str,
    host_name: str,
    location_name: str,
    requested_datetime: str,
    remarks: str,
) -> None:
    try:
        await send_visit_request_denied_email(
            visitor_email=visitor_email,
            visitor_name=visitor_name,
            host_name=host_name,
            location_name=location_name,
            requested_datetime=requested_datetime,
            remarks=remarks,
        )
    except Exception:
        logger.exception("Failed to send visit denied email to %s", visitor_email)
