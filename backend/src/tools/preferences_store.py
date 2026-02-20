"""Tools for reading and writing learned preferences.

Preferences are persisted as JSON at ``~/.clerk-bot/preferences.json``.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from strands import tool

from src.models.preferences import LearnedPreferences
from src.storage.filesystem import get_preferences_path

logger = logging.getLogger(__name__)


def _load_preferences() -> LearnedPreferences:
    """Load preferences from disk, returning an empty object on any failure."""
    prefs_path = get_preferences_path()

    if not prefs_path.exists():
        return LearnedPreferences()

    try:
        raw = prefs_path.read_text(encoding="utf-8")
        return LearnedPreferences(**json.loads(raw))
    except (json.JSONDecodeError, TypeError, Exception) as exc:
        logger.warning(
            "Failed to load preferences from %s: %s. Returning empty preferences.",
            prefs_path,
            exc,
        )
        return LearnedPreferences()


def _save_preferences(prefs: LearnedPreferences) -> None:
    """Persist *prefs* to disk, creating parent directories as needed."""
    prefs_path = get_preferences_path()
    prefs_path.parent.mkdir(parents=True, exist_ok=True)
    prefs_path.write_text(
        prefs.model_dump_json(indent=2),
        encoding="utf-8",
    )


@tool
def get_preferences() -> str:
    """Load learned preferences from disk.

    Reads preferences from ~/.clerk-bot/preferences.json. These are
    question-answer pairs learned from the user's previous form-filling sessions.

    Returns:
        JSON string of all learned preferences, each containing the question,
        answer, source URL, when it was learned, and usage count.
    """
    prefs = _load_preferences()
    return prefs.model_dump_json(indent=2)


@tool
def save_preferences(new_preferences_json: str) -> str:
    """Save or merge new learned preferences to disk.

    Merges new preferences into the existing preferences file at
    ~/.clerk-bot/preferences.json. If a preference with the same normalized
    key already exists, it will be updated.

    Args:
        new_preferences_json: JSON string of preferences to save. Should be a
            dict mapping normalized keys to objects with question, answer, and
            optional source_url fields.

    Returns:
        Confirmation message with the number of preferences saved.
    """
    try:
        incoming: dict[str, Any] = json.loads(new_preferences_json)
    except (json.JSONDecodeError, TypeError) as exc:
        return f"ERROR: Invalid preferences JSON -- {exc}"

    if not isinstance(incoming, dict):
        return "ERROR: new_preferences_json must be a JSON object (dict), not a list or scalar."

    prefs = _load_preferences()
    count = 0

    for _key, entry in incoming.items():
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
        count += 1

    try:
        _save_preferences(prefs)
    except OSError as exc:
        return f"ERROR: Could not write preferences to disk: {exc}"

    prefs_path = get_preferences_path()
    logger.info("Saved %d preference(s) to %s", count, prefs_path)
    total = len(prefs.preferences)
    return (
        f"Successfully saved {count} new/updated preference(s). "
        f"Total preferences on disk: {total}."
    )
