"""Authentication and OTP verification endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database import get_db
from backend.models import User
from backend.services.email_service import email_service
from backend.services.jwt_service import create_token
from backend.services.otp_service import otp_service
from backend.utils.helpers import as_response_user, normalize_email, username_from_email
from backend.utils.security import hash_password, verify_password

router = APIRouter()
settings = get_settings()


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class SignupResponse(BaseModel):
    success: bool
    next: Literal["verify"] = "verify"
    message: str | None = None
    mock_otp: str | None = None


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=settings.otp_length, max_length=settings.otp_length)


class VerifyOtpResponse(BaseModel):
    success: bool
    token: str | None = None
    user: dict[str, str] | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    rememberMe: bool | None = None


class LoginResponse(BaseModel):
    success: bool
    token: str | None = None
    user: dict[str, str] | None = None


class ResendOtpRequest(BaseModel):
    email: EmailStr


class ResendOtpResponse(BaseModel):
    success: bool
    retry_after_seconds: int
    mock_otp: str | None = None


@router.post("/signup", response_model=SignupResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> SignupResponse:
    email = normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()

    if user and user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account is already registered")

    if not user:
        user = User(
            email=email,
            display_name=username_from_email(email),
            hashed_password=hash_password(payload.password),
        )
        db.add(user)
    else:
        user.hashed_password = hash_password(payload.password)

    db.commit()
    db.refresh(user)

    otp_record = otp_service.issue(email)
    email_service.send_otp_email(email, otp_record.code)

    response = SignupResponse(success=True, message="OTP sent to email", next="verify")
    if settings.backend_mock_mode:
        response.mock_otp = otp_record.code
    return response


@router.post("/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)) -> VerifyOtpResponse:
    email = normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    verified = otp_service.verify(email, payload.otp)
    if not verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP")

    user.is_verified = True
    user.otp_verified_at = datetime.now(timezone.utc)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    token = create_token(user.id)
    return VerifyOtpResponse(success=True, token=token, user=as_response_user(user))


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    email = normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account pending verification")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = create_token(user.id)
    return LoginResponse(success=True, token=token, user=as_response_user(user))


@router.post("/resend-otp", response_model=ResendOtpResponse)
def resend_otp(payload: ResendOtpRequest, db: Session = Depends(get_db)) -> ResendOtpResponse:
    email = normalize_email(payload.email)
    user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account already verified")

    can_send, remaining = otp_service.can_resend(email)
    if not can_send:
        return ResendOtpResponse(success=False, retry_after_seconds=remaining)

    record, _ = otp_service.resend(email)
    if not record:
        record = otp_service.issue(email)
    email_service.send_otp_email(email, record.code)

    response = ResendOtpResponse(success=True, retry_after_seconds=settings.otp_resend_cooldown_seconds)
    if settings.backend_mock_mode:
        response.mock_otp = record.code
    return response

