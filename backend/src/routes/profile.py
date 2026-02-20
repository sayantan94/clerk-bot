"""Profile management endpoints for clerk-bot.

Provides routes to read the cached user profile and to force a full
re-parse of all documents to rebuild the profile from scratch.
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException

from src.models.profile import UserProfile
from src.storage.filesystem import get_documents_dir, get_profile_path, list_documents

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/profile")
async def get_profile():
    """Get the cached user profile.

    Reads ``~/.clerk-bot/profiles/default.json`` and returns it as a
    JSON object.  Returns an empty profile structure if no profile has
    been cached yet.
    """
    profile_path = get_profile_path()

    if not profile_path.exists():
        return UserProfile().model_dump(mode="json")

    try:
        raw = profile_path.read_text(encoding="utf-8")
        profile = UserProfile(**json.loads(raw))
        return profile.model_dump(mode="json")
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.warning("Corrupted profile at %s: %s", profile_path, exc)
        return UserProfile().model_dump(mode="json")


@router.post("/api/profile/refresh")
async def refresh_profile():
    """Force re-parse all documents and rebuild the profile.

    Deletes cached ``.parsed`` files to force fresh parsing, then
    invokes the Strands agent to rebuild the profile from all available
    documents.
    """
    from src.agents.form_agent import create_agent

    # Delete cached .parsed files to force re-parse
    docs_dir = get_documents_dir()
    deleted_cache_count = 0
    if docs_dir.exists():
        for parsed_file in docs_dir.glob("*.parsed"):
            try:
                parsed_file.unlink()
                deleted_cache_count += 1
            except OSError as exc:
                logger.warning("Could not delete cache file %s: %s", parsed_file, exc)

    # Delete existing profile so the agent starts fresh
    profile_path = get_profile_path()
    if profile_path.exists():
        try:
            profile_path.unlink()
        except OSError as exc:
            logger.warning("Could not delete existing profile: %s", exc)

    # List available documents
    documents = list_documents()
    if not documents:
        empty_profile = UserProfile()
        return {
            "profile": empty_profile.model_dump(mode="json"),
            "documents_parsed": 0,
            "cache_files_deleted": deleted_cache_count,
        }

    filenames = [doc.name for doc in documents]

    agent = create_agent()

    prompt = (
        "I need you to rebuild my profile from scratch.\n\n"
        f"Available documents: {json.dumps(filenames)}\n\n"
        "Please:\n"
        "1. Parse each document using parse_document.\n"
        "2. Extract all personal information, education, work experience, "
        "skills, identification, and insurance data.\n"
        "3. Merge everything into a single comprehensive profile.\n"
        "4. Save the profile using save_profile.\n"
        "5. Then return the saved profile using get_profile."
    )

    try:
        result = agent(prompt)
    except Exception as exc:
        logger.exception("Agent failed during profile refresh")
        raise HTTPException(
            status_code=502,
            detail=f"Agent failed during profile refresh: {exc}",
        ) from exc

    # Read back the saved profile
    if profile_path.exists():
        try:
            raw = profile_path.read_text(encoding="utf-8")
            profile = UserProfile(**json.loads(raw))
            return {
                "profile": profile.model_dump(mode="json"),
                "documents_parsed": len(filenames),
                "cache_files_deleted": deleted_cache_count,
            }
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.warning("Failed to read refreshed profile: %s", exc)

    # If we couldn't read the profile back, return what the agent said
    return {
        "profile": UserProfile().model_dump(mode="json"),
        "documents_parsed": len(filenames),
        "cache_files_deleted": deleted_cache_count,
        "agent_response": str(result),
    }
