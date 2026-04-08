# backend/app/schemas/auth.py
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr

UserRole = Literal["admin", "manufacturer", "designer", "consumer"]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: UserRole = "consumer"
    tenant_id: Optional[UUID] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
