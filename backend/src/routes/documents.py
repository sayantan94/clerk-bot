"""Document listing endpoint for clerk-bot.

Provides a route to list all documents in ``~/.clerk-bot/documents/``
along with their parse status, size, and modification time.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter

from src.storage.filesystem import list_documents

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/documents")
async def list_all_documents():
    """List all documents in ~/.clerk-bot/documents/ with parse status.

    Returns a list of objects each containing the filename, file size
    in bytes, whether a ``.parsed`` cache file exists, and the
    last-modified timestamp (ISO-8601).
    """
    documents = list_documents()

    result = []
    for doc_path in documents:
        try:
            stat = doc_path.stat()
            size = stat.st_size
            modified_ts = stat.st_mtime
            modified = datetime.fromtimestamp(modified_ts, tz=timezone.utc).isoformat()
        except OSError as exc:
            logger.warning("Could not stat %s: %s", doc_path, exc)
            size = 0
            modified = None

        # Check for companion .parsed cache file
        parsed_cache = doc_path.with_suffix(doc_path.suffix + ".parsed")
        parsed = parsed_cache.exists()

        # If parsed cache exists, also check if it's still valid (newer than source)
        if parsed:
            try:
                cache_mtime = os.path.getmtime(parsed_cache)
                source_mtime = os.path.getmtime(doc_path)
                parsed = cache_mtime >= source_mtime
            except OSError:
                parsed = False

        result.append(
            {
                "filename": doc_path.name,
                "size": size,
                "parsed": parsed,
                "modified": modified,
            }
        )

    return {"documents": result, "total": len(result)}
