"""Filesystem helpers for the ~/.clerk-bot/ directory tree.

Provides path resolution, directory creation, and simple listing utilities
used throughout the application.
"""

from __future__ import annotations

from pathlib import Path

from src.config import (
    DIR_DOCUMENTS,
    DIR_PROFILES,
    DEFAULT_PROFILE_NAME,
    ENV_FILENAME,
    PREFERENCES_FILENAME,
    get_base_dir,
)


def ensure_directories() -> None:
    """Create the full ~/.clerk-bot/ directory tree if it does not exist."""
    for directory in (get_documents_dir(), get_profiles_dir()):
        directory.mkdir(parents=True, exist_ok=True)


def get_documents_dir() -> Path:
    """Return the path to ~/.clerk-bot/documents/."""
    return get_base_dir() / DIR_DOCUMENTS


def get_profiles_dir() -> Path:
    """Return the path to ~/.clerk-bot/profiles/."""
    return get_base_dir() / DIR_PROFILES


def get_preferences_path() -> Path:
    """Return the path to ~/.clerk-bot/preferences.json."""
    return get_base_dir() / PREFERENCES_FILENAME


def get_env_path() -> Path:
    """Return the path to ~/.clerk-bot/.env."""
    return get_base_dir() / ENV_FILENAME


def get_profile_path(name: str = DEFAULT_PROFILE_NAME) -> Path:
    """Return the path to a named profile JSON file.

    Parameters
    ----------
    name:
        Profile name (without extension).  Defaults to ``"default"``.
    """
    return get_profiles_dir() / f"{name}.json"


def list_documents() -> list[Path]:
    """Return a sorted list of all file paths inside the documents directory.

    Only regular files are included (hidden files and subdirectories are
    skipped).
    """
    docs_dir = get_documents_dir()
    if not docs_dir.exists():
        return []
    return sorted(
        p for p in docs_dir.iterdir() if p.is_file() and not p.name.startswith(".")
    )
