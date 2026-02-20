"""FastAPI application for clerk-bot.

Run with: uvicorn src.server:app --host 0.0.0.0 --port 8394 --reload
Or: clerk-bot start
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routes import autofill, documents, health, preferences, profile
from src.storage.filesystem import ensure_directories

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Clerk-Bot",
    description="AI-Powered Universal Form Auto-Filler",
    version="0.3.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8394",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8394",
    ],
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(profile.router)
app.include_router(preferences.router)
app.include_router(documents.router)
app.include_router(autofill.router)


@app.on_event("startup")
async def on_startup():
    ensure_directories()
    logger.info("Clerk-Bot server started.")
