"""Tools for communicating with the Chrome extension's content script.

These tools allow the Strands agent to scan form fields, fill values,
and click elements — all executed by the content script in the user's
real browser. Each tool blocks until the content script confirms the
action via the REST API.
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from strands import tool

if TYPE_CHECKING:
    from src.autofill_session import AutofillSession

logger = logging.getLogger(__name__)

# Module-level reference to the current session, set by AutofillSession
# before starting the agent.
_current_session: AutofillSession | None = None


def set_current_session(session: AutofillSession | None) -> None:
    """Set the active session for the page bridge tools."""
    global _current_session
    _current_session = session


def _get_session() -> AutofillSession:
    """Get the active session, raising if none is set."""
    if _current_session is None:
        raise RuntimeError("No active autofill session — cannot access page.")
    return _current_session


@tool
def scan_page() -> str:
    """Scan the current page to see all form fields, their labels, and buttons.

    Returns a JSON string describing the page:
    - url: The page URL
    - title: The page title
    - fields: Array of form fields, each with:
        - ref: Unique reference ID (e.g., "f0", "f1") — use this in fill_field
        - tag: HTML tag ("input", "select", "textarea")
        - type: Input type ("text", "email", "tel", "select", "textarea",
                "checkbox", "radio", "file", "date", "number", etc.)
        - label: The field's label text
        - name: The HTML name attribute
        - value: Current value (empty string if unfilled)
        - placeholder: Placeholder text
        - required: Whether the field is required
        - options: For select fields, the list of available option texts
        - checked: For checkboxes/radios, whether currently checked
    - buttons: Array of clickable buttons, each with:
        - ref: Unique reference ID (e.g., "b0", "b1") — use this in click_element
        - text: Button text
        - type: Button type ("submit", "button")

    Call this BEFORE filling any fields to understand the form layout,
    and AFTER clicking a navigation button to see the new page state.
    """
    session = _get_session()
    logger.info("scan_page called — requesting page scan from content script")
    page_data = session.request_scan()
    return json.dumps(page_data, indent=2)


@tool
def fill_field(ref: str, value: str) -> str:
    """Fill a form field with a value.

    Works for all field types:
    - Text/email/tel/number inputs: types the value
    - Select dropdowns: selects the option matching the value text
    - Checkboxes: checks if value is "true"/"yes", unchecks if "false"/"no"
    - Radio buttons: selects if value matches
    - Textareas: types the value
    - Date inputs: sets the date value

    Args:
        ref: The field reference from scan_page (e.g., "f0", "f3")
        value: The value to fill. For selects, use the exact option text.
            For checkboxes, use "true" or "false".

    Returns:
        A confirmation message (success or error).
    """
    session = _get_session()
    logger.info("fill_field called: ref=%r, value=%r", ref, value)
    result = session.execute_action("fill_field", {"ref": ref, "value": value})
    if result.get("error"):
        return f"Error filling {ref}: {result['error']}"
    return f"Filled {ref} with value."


@tool
def click_element(ref: str) -> str:
    """Click a button or element on the page.

    Use this to click Submit, Next, Save, Continue, or other navigation
    buttons after filling all visible form fields.

    Args:
        ref: The element reference from scan_page (e.g., "b0", "b1")

    Returns:
        A confirmation message. After clicking a navigation button,
        call scan_page again to see the new page state.
    """
    session = _get_session()
    logger.info("click_element called: ref=%r", ref)
    result = session.execute_action("click_element", {"ref": ref})
    if result.get("error"):
        return f"Error clicking {ref}: {result['error']}"
    return f"Clicked {ref}. Call scan_page to see the new page state."
