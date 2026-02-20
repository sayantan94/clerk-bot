"""Preferences management endpoints for clerk-bot.

Provides routes to read, save/merge, and delete learned user preferences.
Preferences are stored at ``~/.clerk-bot/preferences.json``.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.models.preferences import LearnedPreferences
from src.storage.filesystem import get_preferences_path

logger = logging.getLogger(__name__)

router = APIRouter()


def _load_preferences() -> LearnedPreferences:
    """Load preferences from disk, returning an empty object on failure."""
    prefs_path = get_preferences_path()

    if not prefs_path.exists():
        return LearnedPreferences()

    try:
        raw = prefs_path.read_text(encoding="utf-8")
        return LearnedPreferences(**json.loads(raw))
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.warning("Failed to load preferences: %s", exc)
        return LearnedPreferences()


def _save_preferences_to_disk(prefs: LearnedPreferences) -> None:
    """Persist preferences to disk, creating parent directories as needed."""
    prefs_path = get_preferences_path()
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        prefs.model_dump_json(indent=2),
        encoding="utf-8",
    )


class SavePreferencesRequest(BaseModel):
    """Payload for saving/merging preferences.

    Each entry in the ``preferences`` dict should be keyed by a
    normalized question string and contain at least ``question`` and
    ``answer`` fields. An optional ``source_url`` field may be included.
    """

    preferences: dict  # key -> {question, answer, source_url?}


@router.get("/api/preferences")
async def get_preferences():
    """Get all learned preferences.

    Reads ``~/.clerk-bot/preferences.json`` and returns the full
    preferences object.
    """
    prefs = _load_preferences()
    return prefs.model_dump(mode="json")


@router.put("/api/preferences")
async def save_preferences(request: SavePreferencesRequest):
    """Save or merge new preferences.

    Merges the supplied preferences into the existing preferences file.
    Existing entries with matching keys are updated; new keys are added.
    """
    if not request.preferences:
        raise HTTPException(status_code=400, detail="No preferences provided.")

    prefs = _load_preferences()
    merged_count = 0

    for _key, entry in request.preferences.items():
        if not isinstance(entry, dict):
            logger.warning("Skipping non-dict preference entry for key %r", _key)
            continue

        question = entry.get("question")
        answer = entry.get("answer")

        if not question or not answer:
            logger.warning(
                "Skipping preference entry for key %r: missing question or answer",
                _key,
            )
            continue

        prefs.add_preference(
            question=str(question),
            answer=str(answer),
            source_url=entry.get("source_url"),
        )
        merged_count += 1

    try:
        _save_preferences_to_disk(prefs)
    except OSError as exc:
        logger.exception("Failed to write preferences to disk")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write preferences to disk: {exc}",
        ) from exc

    total = len(prefs.preferences)
    return {
        "merged": merged_count,
        "total": total,
    }


@router.delete("/api/preferences/{key}")
async def delete_preference(key: str):
    """Delete a specific preference by key.

    The *key* is the normalized question string used when the preference
    was originally stored. Returns 404 if the key does not exist.
    """
    prefs = _load_preferences()

    if not prefs.remove_preference(key):
        raise HTTPException(
            status_code=404,
            detail=f"Preference key not found: {key!r}",
        )

    try:
        _save_preferences_to_disk(prefs)
    except OSError as exc:
        logger.exception("Failed to write preferences to disk after deletion")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write preferences to disk: {exc}",
        ) from exc

    return {
        "deleted": key,
        "total": len(prefs.preferences),
    }
