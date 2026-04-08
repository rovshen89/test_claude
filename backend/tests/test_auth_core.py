# backend/tests/test_auth_core.py
import pytest
from app.core.auth import hash_password, verify_password, create_access_token, decode_token


def test_hash_and_verify_password():
    hashed = hash_password("secret")
    assert hashed != "secret"
    assert verify_password("secret", hashed)
    assert not verify_password("wrong", hashed)


def test_create_and_decode_token():
    token = create_access_token(user_id="abc-123", role="designer")
    payload = decode_token(token)
    assert payload["sub"] == "abc-123"
    assert payload["role"] == "designer"


def test_decode_invalid_token_raises():
    import jwt
    with pytest.raises(jwt.InvalidTokenError):
        decode_token("not.a.valid.token")
