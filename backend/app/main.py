# backend/app/main.py
from fastapi import FastAPI

from app.api.router import api_router

app = FastAPI(title="Furniture Constructor API", version="1.0.0")

app.include_router(api_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
