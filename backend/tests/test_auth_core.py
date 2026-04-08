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


def test_expired_token_raises():
    import jwt as pyjwt
    from datetime import datetime, timedelta, timezone
    from app.config import settings
    payload = {
        "sub": "u1",
        "role": "designer",
        "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
    }
    expired_token = pyjwt.encode(payload, settings.secret_key, algorithm="HS256")
    with pytest.raises(pyjwt.InvalidTokenError):
        decode_token(expired_token)


def test_wrong_secret_key_raises():
    import jwt as pyjwt
    from app.config import settings
    payload = {"sub": "u1", "role": "designer"}
    # Sign with a different key
    bad_token = pyjwt.encode(payload, "a-completely-different-secret-key-abcdef", algorithm="HS256")
    with pytest.raises(pyjwt.InvalidTokenError):
        decode_token(bad_token)
