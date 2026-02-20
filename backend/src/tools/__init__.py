"""Strands agent tools for clerk-bot.

Each tool is decorated with ``@strands.tool`` so the Strands agent can invoke
it by name during a conversation turn.  Tools provide document parsing,
profile and preference persistence, human-in-the-loop interaction, and
content script browser communication.
"""

from .ask_human import ask_human
from .page_bridge import scan_page, fill_field, click_element
from .parse_document import parse_document
from .preferences_store import get_preferences, save_preferences
from .profile_store import get_profile, save_profile

__all__ = [
    "ask_human",
    "scan_page",
    "fill_field",
    "click_element",
    "parse_document",
    "get_profile",
    "save_profile",
    "get_preferences",
    "save_preferences",
]
