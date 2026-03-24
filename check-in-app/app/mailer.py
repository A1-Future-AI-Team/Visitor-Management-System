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
