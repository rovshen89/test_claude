# backend/tests/test_auth.py
import pytest


@pytest.mark.asyncio
async def test_register_success(client):
    response = await client.post("/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "role": "consumer",
    })
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email_returns_400(client):
    payload = {"email": "dup@example.com", "password": "password", "role": "consumer"}
    await client.post("/auth/register", json=payload)
    response = await client.post("/auth/register", json=payload)
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_success(client):
    await client.post("/auth/register", json={
        "email": "login@example.com",
        "password": "password",
        "role": "designer",
    })
    response = await client.post("/auth/login", json={
        "email": "login@example.com",
        "password": "password",
    })
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client):
    await client.post("/auth/register", json={
        "email": "wrong@example.com",
        "password": "password",
        "role": "consumer",
    })
    response = await client.post("/auth/login", json={
        "email": "wrong@example.com",
        "password": "wrong",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_nonexistent_email_returns_401(client):
    response = await client.post("/auth/login", json={
        "email": "nobody@example.com",
        "password": "whatever",
    })
    assert response.status_code == 401
    assert "detail" in response.json()


@pytest.mark.asyncio
async def test_login_wrong_password_has_error_detail(client):
    await client.post("/auth/register", json={
        "email": "detail@example.com",
        "password": "password",
        "role": "consumer",
    })
    response = await client.post("/auth/login", json={
        "email": "detail@example.com",
        "password": "wrong",
    })
    assert response.status_code == 401
    assert "detail" in response.json()


@pytest.mark.asyncio
async def test_register_invalid_role_returns_422(client):
    response = await client.post("/auth/register", json={
        "email": "hacker@example.com",
        "password": "password",
        "role": "superuser",
    })
    assert response.status_code == 422
