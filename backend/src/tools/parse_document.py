"""Tool for parsing user-uploaded documents.

Reads files from ``~/.clerk-bot/documents/`` and extracts text or image data
that the LLM agent can use to populate form fields.  Parsed results are
cached in companion ``.parsed`` files so repeated invocations are fast.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
import os
from pathlib import Path

from strands import tool

from src.storage.filesystem import get_documents_dir

logger = logging.getLogger(__name__)

# Supported file extensions grouped by processing strategy.
_PDF_EXTENSIONS: set[str] = {".pdf"}
_IMAGE_EXTENSIONS: set[str] = {".jpg", ".jpeg", ".png", ".webp"}
_TEXT_EXTENSIONS: set[str] = {".txt", ".md", ".csv"}

# MIME types for image extensions (fallback when mimetypes module misses).
_IMAGE_MIME: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def _parsed_path(original: Path) -> Path:
    """Return the companion ``.parsed`` cache path for *original*."""
    return original.with_suffix(original.suffix + ".parsed")


def _is_cache_valid(original: Path, cache: Path) -> bool:
    """Return ``True`` if *cache* exists and is newer than *original*."""
    if not cache.exists():
        return False
    return os.path.getmtime(cache) >= os.path.getmtime(original)


def _extract_pdf_text(file_path: Path) -> str:
    """Extract text from a PDF using *pypdf*."""
    try:
        from pypdf import PdfReader  # type: ignore[import-untyped]
    except ImportError as exc:
        return (
            f"ERROR: pypdf is not installed. Cannot parse PDF '{file_path.name}'. "
            f"Install it with: pip install pypdf  ({exc})"
        )

    reader = PdfReader(str(file_path))
    pages: list[str] = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            pages.append(f"--- Page {i + 1} ---\n{text}")
    if not pages:
        return f"WARNING: No extractable text found in PDF '{file_path.name}'."
    return "\n\n".join(pages)


def _encode_image(file_path: Path) -> str:
    """Return a prefixed base64 string for an image file."""
    mime_type = _IMAGE_MIME.get(
        file_path.suffix.lower(),
        mimetypes.guess_type(str(file_path))[0] or "application/octet-stream",
    )
    raw = file_path.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    return f"IMAGE_BASE64:{mime_type}:{b64}"


def _read_text(file_path: Path) -> str:
    """Read a plain-text file and return its content."""
    return file_path.read_text(encoding="utf-8")


@tool
def parse_document(filename: str) -> str:
    """Parse a document from the documents directory and extract structured data.

    Reads a file from ~/.clerk-bot/documents/ and extracts information relevant
    to form filling. Supports PDF files (via pypdf text extraction) and image files
    (returns base64 for vision-based extraction).

    Args:
        filename: Name of the file in the documents directory to parse.

    Returns:
        Extracted text content from the document, or base64-encoded image data
        with a prefix indicating it needs vision-based extraction.
    """
    docs_dir = get_documents_dir()
    file_path = docs_dir / filename

    if not file_path.exists():
        return (
            f"ERROR: File '{filename}' not found in documents directory "
            f"({docs_dir}). Available files: "
            + ", ".join(
                p.name
                for p in sorted(docs_dir.iterdir())
                if p.is_file() and not p.name.startswith(".")
            )
            if docs_dir.exists()
            else f"ERROR: Documents directory does not exist ({docs_dir})."
        )

    if not file_path.is_file():
        return f"ERROR: '{filename}' is not a regular file."

    ext = file_path.suffix.lower()

    cache = _parsed_path(file_path)
    if ext not in _IMAGE_EXTENSIONS and _is_cache_valid(file_path, cache):
        logger.debug("Returning cached parsed content for %s", filename)
        return cache.read_text(encoding="utf-8")

    try:
        if ext in _PDF_EXTENSIONS:
            result = _extract_pdf_text(file_path)
        elif ext in _IMAGE_EXTENSIONS:
            # Images are not cached because the base64 blob is large and
            # regenerating it is cheap.
            return _encode_image(file_path)
        elif ext in _TEXT_EXTENSIONS:
            result = _read_text(file_path)
        else:
            return (
                f"ERROR: Unsupported file type '{ext}' for file '{filename}'. "
                "Supported types: .pdf, .jpg, .jpeg, .png, .webp, .txt, .md, .csv."
            )
    except Exception as exc:
        logger.exception("Failed to parse document '%s'", filename)
        return f"ERROR: Failed to parse '{filename}': {exc}"

    try:
        cache.write_text(result, encoding="utf-8")
        logger.debug("Cached parsed content for %s -> %s", filename, cache.name)
    except OSError:
        logger.warning("Could not write parse cache for %s", filename, exc_info=True)

    return result
