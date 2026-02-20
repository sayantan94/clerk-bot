"""Pydantic models for learned user preferences.

Preferences capture answers the user has given to subjective or
site-specific questions (e.g. "How did you hear about us?") so that
clerk-bot can reuse them on future forms without asking again.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from pydantic import BaseModel


class LearnedPreference(BaseModel):
    """A single learned preference from user input."""

    question: str  # normalized question / label text
    answer: str
    source_url: str | None = None  # page where this was learned
    learned_at: str | None = None  # ISO-8601 timestamp
    times_used: int = 0


class LearnedPreferences(BaseModel):
    """Collection of learned preferences, keyed by a normalized question string."""

    preferences: dict[str, LearnedPreference] = {}

    def get_answer(self, question: str) -> str | None:
        """Look up a stored answer by question text.

        The lookup uses the same normalization applied when preferences are
        saved, so minor differences in casing / punctuation are tolerated.
        Returns ``None`` when no match is found.
        """
        key = self._normalize(question)
        pref = self.preferences.get(key)
        if pref is not None:
            pref.times_used += 1
            return pref.answer
        return None

    def add_preference(
        self,
        question: str,
        answer: str,
        source_url: str | None = None,
    ) -> None:
        """Add or update a preference entry."""
        key = self._normalize(question)
        now = datetime.now(timezone.utc).isoformat()
        existing = self.preferences.get(key)
        if existing is not None:
            existing.answer = answer
            existing.source_url = source_url or existing.source_url
            existing.learned_at = now
        else:
            self.preferences[key] = LearnedPreference(
                question=question.strip(),
                answer=answer,
                source_url=source_url,
                learned_at=now,
            )

    def remove_preference(self, key: str) -> bool:
        """Remove a preference by its normalized key.

        Returns ``True`` if the key existed and was removed, ``False``
        otherwise.
        """
        normalized = self._normalize(key)
        if normalized in self.preferences:
            del self.preferences[normalized]
            return True
        return False

    def to_context_string(self) -> str:
        """Format all preferences into a human-readable string for LLM context.

        Example output::

            Previously answered questions:
            - "How did you hear about us?" -> "Google Search"
            - "Preferred contact method?" -> "Email"
        """
        if not self.preferences:
            return "No previously learned preferences."

        lines = ["Previously answered questions:"]
        for pref in self.preferences.values():
            lines.append(f'- "{pref.question}" -> "{pref.answer}"')
        return "\n".join(lines)

    @staticmethod
    def _normalize(text: str) -> str:
        """Produce a stable dictionary key from free-form question text.

        Lowercases, strips whitespace, removes punctuation, and collapses
        multiple spaces.
        """
        text = text.lower().strip()
        text = re.sub(r"[^\w\s]", "", text)
        text = re.sub(r"\s+", " ", text)
        return text
