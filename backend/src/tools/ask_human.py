"""Tool for pausing the agent to ask the human user a question.

When the agent encounters a form field it cannot fill from profile or
preferences, it calls ask_human. This blocks the agent thread until the
human provides an answer via the REST API (POST /api/autofill/answer).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from strands import tool

if TYPE_CHECKING:
    from src.autofill_session import AutofillSession

logger = logging.getLogger(__name__)

# Module-level reference to the current session, set by AutofillSession
# before starting the agent. This avoids passing session context through
# the Strands tool interface.
_current_session: AutofillSession | None = None


def set_current_session(session: AutofillSession | None) -> None:
    """Set the active session for the ask_human tool."""
    global _current_session
    _current_session = session


def get_current_session() -> AutofillSession:
    """Get the active session, raising if none is set."""
    if _current_session is None:
        raise RuntimeError("No active autofill session — cannot ask human.")
    return _current_session


@tool
def ask_human(question: str, field_context: str = "") -> str:
    """Ask the human user a question and wait for their answer.

    Use this when you encounter a form field that you cannot fill from the
    user's profile or learned preferences. The human will see the question
    in the browser extension overlay and can type their answer.

    Args:
        question: The question to ask (e.g., "What is your desired salary?")
        field_context: Optional context about which field this is for
            (e.g., "Desired Salary field on the Compensation page")

    Returns:
        The human's answer as a string.
    """
    session = get_current_session()
    logger.info("ask_human called: question=%r, context=%r", question, field_context)
    answer = session.ask_human(question, field_context)
    logger.info("ask_human answered: %r", answer)
    return answer
