"""Tools for reading and writing the user profile.

The profile is persisted as JSON at ``~/.clerk-bot/profiles/default.json``.
"""

from __future__ import annotations

import json
import logging

from strands import tool

from src.models.profile import UserProfile
from src.storage.filesystem import get_profile_path, get_profiles_dir

logger = logging.getLogger(__name__)


@tool
def get_profile() -> str:
    """Load the cached user profile from disk.

    Reads the default profile from ~/.clerk-bot/profiles/default.json.
    Returns the profile as a JSON string, or an empty profile if none exists.

    Returns:
        JSON string of the user profile containing personal info, education,
        work experience, skills, identification documents, and insurance data.
    """
    profile_path = get_profile_path()

    if not profile_path.exists():
        logger.info("No profile found at %s; returning empty profile.", profile_path)
        empty = UserProfile()
        return empty.model_dump_json(indent=2)

    try:
        raw = profile_path.read_text(encoding="utf-8")
        # Validate by round-tripping through the model.
        profile = UserProfile(**json.loads(raw))
        return profile.model_dump_json(indent=2)
    except (json.JSONDecodeError, TypeError, Exception) as exc:
        logger.warning(
            "Failed to load profile from %s: %s. Returning empty profile.",
            profile_path,
            exc,
        )
        empty = UserProfile()
        return empty.model_dump_json(indent=2)


@tool
def save_profile(profile_json: str) -> str:
    """Save the user profile to disk.

    Writes the profile JSON to ~/.clerk-bot/profiles/default.json.
    Creates the profiles directory if it doesn't exist.

    Args:
        profile_json: JSON string of the complete user profile to save.

    Returns:
        Confirmation message indicating the profile was saved successfully.
    """
    try:
        profile = UserProfile(**json.loads(profile_json))
    except (json.JSONDecodeError, TypeError, Exception) as exc:
        return f"ERROR: Invalid profile JSON -- {exc}"

    profiles_dir = get_profiles_dir()
    try:
        profiles_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        return f"ERROR: Could not create profiles directory ({profiles_dir}): {exc}"

    profile_path = get_profile_path()
    try:
        profile_path.write_text(
            profile.model_dump_json(indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        return f"ERROR: Could not write profile to {profile_path}: {exc}"

    logger.info("Profile saved to %s", profile_path)
    return f"Profile saved successfully to {profile_path}."
