# backend/app/main.py
from fastapi import FastAPI

app = FastAPI(title="Furniture Constructor API", version="1.0.0")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
