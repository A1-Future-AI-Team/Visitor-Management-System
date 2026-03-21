import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone
from functools import lru_cache
from io import BytesIO

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import qrcode
from itsdangerous import BadData, SignatureExpired, URLSafeTimedSerializer

# Admin API key used for protecting admin and sensitive endpoints.
# Set via environment variable for production. Falls back to a dev key for local testing.
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")
if not ADMIN_API_KEY:
    import warnings
    warnings.warn(
        "ADMIN_API_KEY is not set. Using insecure default for local development only.",
        stacklevel=1,
    )
    ADMIN_API_KEY = "dev-admin-key"

# FastAPI security scheme (Bearer token) used to authenticate admin requests.
admin_auth_scheme = HTTPBearer(auto_error=False)

APP_SECRET_KEY = os.getenv("APP_SECRET_KEY", "dev-secret-change-me")
OTP_TTL_MINUTES = int(os.getenv("OTP_TTL_MINUTES", "10"))
REGISTRATION_TOKEN_TTL_MINUTES = int(os.getenv("REGISTRATION_TOKEN_TTL_MINUTES", "15"))
QR_TOKEN_TTL_HOURS = int(os.getenv("QR_TOKEN_TTL_HOURS", "168"))
OTP_PURPOSE_REGISTRATION = "registration"
QR_TOKEN_PURPOSE = "entry_qr"
REGISTRATION_TOKEN_PURPOSE = "registration_verified"


class TokenValidationError(ValueError):
    pass


class OTPValidationError(ValueError):
    pass


@lru_cache(maxsize=1)
def _get_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(APP_SECRET_KEY)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(email: str, purpose: str, otp: str) -> str:
    normalized_email = email.strip().lower()
    payload = f"{normalized_email}:{purpose}:{otp}".encode("utf-8")
    secret = APP_SECRET_KEY.encode("utf-8")
    return hashlib.sha256(secret + b":" + payload).hexdigest()


def verify_hashed_otp(email: str, purpose: str, otp: str, stored_hash: str) -> bool:
    expected = hash_otp(email=email, purpose=purpose, otp=otp)
    return hmac.compare_digest(expected, stored_hash)


def build_registration_verification_token(email: str) -> str:
    payload = {
        "email": email.strip().lower(),
        "purpose": REGISTRATION_TOKEN_PURPOSE,
        "issued_at": utcnow().isoformat(),
    }
    return _get_serializer().dumps(payload, salt=REGISTRATION_TOKEN_PURPOSE)


def validate_registration_verification_token(token: str, email: str) -> None:
    try:
        payload = _get_serializer().loads(
            token,
            salt=REGISTRATION_TOKEN_PURPOSE,
            max_age=REGISTRATION_TOKEN_TTL_MINUTES * 60,
        )
    except SignatureExpired as exc:
        raise TokenValidationError("Verification token has expired. Request a new OTP.") from exc
    except BadData as exc:
        raise TokenValidationError("Verification token is invalid.") from exc

    normalized_email = email.strip().lower()
    if payload.get("purpose") != REGISTRATION_TOKEN_PURPOSE or payload.get("email") != normalized_email:
        raise TokenValidationError("Verification token does not match this email address.")


def build_qr_token(visitor_id: int) -> str:
    payload = {
        "visitor_id": visitor_id,
        "purpose": QR_TOKEN_PURPOSE,
        "issued_at": utcnow().isoformat(),
    }
    return _get_serializer().dumps(payload, salt=QR_TOKEN_PURPOSE)


def resolve_qr_token(token: str) -> int:
    try:
        payload = _get_serializer().loads(
            token,
            salt=QR_TOKEN_PURPOSE,
            max_age=QR_TOKEN_TTL_HOURS * 3600,
        )
    except SignatureExpired as exc:
        raise TokenValidationError("QR code has expired.") from exc
    except BadData as exc:
        raise TokenValidationError("QR code is invalid.") from exc

    if payload.get("purpose") != QR_TOKEN_PURPOSE:
        raise TokenValidationError("QR code purpose is invalid.")

    visitor_id = payload.get("visitor_id")
    if not isinstance(visitor_id, int):
        raise TokenValidationError("QR code payload is malformed.")
    return visitor_id


def build_qr_image_bytes(payload: str) -> bytes:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(payload)
    qr.make(fit=True)

    image = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer.getvalue()


def require_admin_api_key(credentials: HTTPAuthorizationCredentials = Security(admin_auth_scheme)) -> str:
    """FastAPI dependency to protect admin/sensitive endpoints.

    Uses a Bearer token (Authorization: Bearer <token>) and compares it against
    the ADMIN_API_KEY environment variable.

    This is intentionally kept simple for this demo application.
    """
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    if not secrets.compare_digest(credentials.credentials, ADMIN_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")

    return credentials.credentials