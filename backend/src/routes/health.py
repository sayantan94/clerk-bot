"""Health check endpoint for clerk-bot.

Returns server status along with document count, profile cache status,
and number of learned preferences.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter

from src.storage.filesystem import (
    get_preferences_path,
    get_profile_path,
    list_documents,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/health")
async def health():
    """Health check endpoint.

    Returns server status, document count, profile cached status,
    and preferences count.
    """
    # -- Documents count --
    try:
        documents = list_documents()
        documents_count = len(documents)
    except Exception as exc:
        logger.warning("Failed to list documents: %s", exc)
        documents_count = 0

    # -- Profile cached status --
    try:
        profile_path = get_profile_path()
        profile_cached = profile_path.exists() and profile_path.stat().st_size > 0
    except Exception as exc:
        logger.warning("Failed to check profile cache: %s", exc)
        profile_cached = False

    # -- Preferences count --
    preferences_count = 0
    try:
        prefs_path = get_preferences_path()
        if prefs_path.exists():
            raw = prefs_path.read_text(encoding="utf-8")
            data = json.loads(raw)
            preferences_count = len(data.get("preferences", {}))
    except (json.JSONDecodeError, OSError, Exception) as exc:
        logger.warning("Failed to count preferences: %s", exc)

    return {
        "status": "ok",
        "documents_count": documents_count,
        "profile_cached": profile_cached,
        "preferences_count": preferences_count,
    }
