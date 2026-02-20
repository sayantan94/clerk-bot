"""Autofill session manager.

Manages the lifecycle of one autofill run:
- Starts Strands agent in a background thread
- Provides SSE stream of status updates
- Handles ask_human pause/resume via threading.Event
- Handles page scan and action requests via content script bridge
- Tracks state: idle -> running -> waiting_for_human -> running -> done/error
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import uuid
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class SessionState(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    WAITING_FOR_HUMAN = "waiting_for_human"
    DONE = "done"
    ERROR = "error"
    STOPPED = "stopped"


class AutofillSession:
    """Manages one autofill agent run."""

    def __init__(self) -> None:
        self.id: str = uuid.uuid4().hex[:12]
        self.state: SessionState = SessionState.IDLE
        self.status_queue: queue.Queue[dict[str, Any]] = queue.Queue()

        self._human_answer_event = threading.Event()
        self._last_answer: str = ""
        self.pending_question: str | None = None
        self.pending_field_context: str | None = None

        self._scan_event = threading.Event()
        self._page_data: dict[str, Any] | None = None
        self._action_event = threading.Event()
        self._action_result: dict[str, Any] | None = None

        self._agent_thread: threading.Thread | None = None
        self._stop_requested = False

    def start(self) -> None:
        """Start the agent in a background thread."""
        if self.state != SessionState.IDLE:
            raise RuntimeError(f"Cannot start session in state {self.state}")

        self.state = SessionState.RUNNING
        self._push_status("started", "Agent is starting...")

        self._agent_thread = threading.Thread(
            target=self._run_agent,
            name=f"autofill-{self.id}",
            daemon=True,
        )
        self._agent_thread.start()

    def ask_human(self, question: str, field_context: str = "") -> str:
        """Called by the ask_human tool. Blocks until human answers."""
        self.state = SessionState.WAITING_FOR_HUMAN
        self.pending_question = question
        self.pending_field_context = field_context
        self._human_answer_event.clear()

        self._push_status("ask_human", question, {"field_context": field_context})

        while not self._human_answer_event.is_set():
            if self._stop_requested:
                raise RuntimeError("Session stopped by user")
            self._human_answer_event.wait(timeout=0.5)

        answer = self._last_answer
        self.pending_question = None
        self.pending_field_context = None
        self.state = SessionState.RUNNING
        self._push_status("resumed", "Got answer, continuing...")
        return answer

    def provide_answer(self, answer: str) -> None:
        """Called by POST /api/autofill/answer. Unblocks the agent."""
        if self.state != SessionState.WAITING_FOR_HUMAN:
            raise RuntimeError(
                f"Cannot provide answer in state {self.state} "
                "(not waiting for human input)"
            )
        self._last_answer = answer
        self._human_answer_event.set()

    def request_scan(self) -> dict[str, Any]:
        """Called by scan_page tool. Blocks until content script responds."""
        self._scan_event.clear()
        self._page_data = None
        self._push_status("scan_request", "Scanning page...")

        while not self._scan_event.is_set():
            if self._stop_requested:
                raise RuntimeError("Session stopped by user")
            self._scan_event.wait(timeout=0.5)

        return self._page_data or {}

    def provide_page_data(self, data: dict[str, Any]) -> None:
        """Called by POST /api/autofill/page-data. Unblocks scan_page tool."""
        self._page_data = data
        self._scan_event.set()

    def execute_action(self, action_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Called by fill_field/click_element tools. Blocks until done."""
        self._action_event.clear()
        self._action_result = None
        self._push_status(action_type, f"Executing {action_type}...", payload)

        while not self._action_event.is_set():
            if self._stop_requested:
                raise RuntimeError("Session stopped by user")
            self._action_event.wait(timeout=0.5)

        return self._action_result or {}

    def provide_action_result(self, result: dict[str, Any]) -> None:
        """Called by POST /api/autofill/action-result. Unblocks the tool."""
        self._action_result = result
        self._action_event.set()

    def stop(self) -> None:
        """Stop the agent session."""
        self._stop_requested = True
        self._human_answer_event.set()
        self._scan_event.set()
        self._action_event.set()
        self.state = SessionState.STOPPED
        self._push_status("stopped", "Session stopped by user.")

    def status_stream(self):
        """Yield SSE-formatted events. Blocks on queue.get()."""
        while True:
            try:
                event = self.status_queue.get(timeout=30)
            except queue.Empty:
                yield ": keepalive\n\n"
                continue

            yield f"data: {json.dumps(event)}\n\n"

            if event.get("type") in ("done", "error", "stopped"):
                break

    def _push_status(self, event_type: str, message: str, extra: dict[str, Any] | None = None) -> None:
        event: dict[str, Any] = {
            "type": event_type,
            "message": message,
            "state": self.state.value,
        }
        if extra:
            event.update(extra)
        self.status_queue.put(event)

    def _run_agent(self) -> None:
        """Run the agent loop in a background thread."""
        from src.tools.ask_human import set_current_session
        from src.tools.page_bridge import set_current_session as set_bridge_session

        try:
            set_current_session(self)
            set_bridge_session(self)

            from src.agents.form_agent import create_agent
            from src.tools import (
                ask_human,
                parse_document,
                get_profile,
                save_profile,
                get_preferences,
                save_preferences,
            )
            from src.tools.page_bridge import scan_page, fill_field, click_element

            self._push_status("running", "Agent starting...")

            agent = create_agent(
                extra_tools=[
                    scan_page,
                    fill_field,
                    click_element,
                    ask_human,
                    parse_document,
                    get_profile,
                    save_profile,
                    get_preferences,
                    save_preferences,
                ],
            )

            self._push_status("running", "Agent connected. Starting form fill...")

            prompt = (
                "The user's browser is open on a form page. "
                "Start by calling scan_page to see the current form fields. "
                "Then call get_profile and get_preferences to load user data. "
                "Fill out any form fields you can using fill_field. "
                "For fields you cannot determine, call ask_human. "
                "After filling all fields on the current page, "
                "click the Next/Submit/Continue button using click_element, "
                "then call scan_page again and repeat for the next page."
            )

            result = agent(prompt)
            response_text = str(result)
            logger.info("Agent finished. Response length: %d", len(response_text))

            if self._stop_requested:
                self.state = SessionState.STOPPED
                self._push_status("stopped", "Session stopped.")
            else:
                self.state = SessionState.DONE
                self._push_status("done", "Form filling complete!")

        except Exception as exc:
            logger.exception("Agent error in session %s", self.id)
            self.state = SessionState.ERROR
            self._push_status("error", f"Agent error: {exc}")
        finally:
            set_current_session(None)
            set_bridge_session(None)


_sessions: dict[str, AutofillSession] = {}
_sessions_lock = threading.Lock()


def create_session() -> AutofillSession:
    session = AutofillSession()
    with _sessions_lock:
        _sessions[session.id] = session
    return session


def get_session(session_id: str) -> AutofillSession:
    with _sessions_lock:
        session = _sessions.get(session_id)
    if session is None:
        raise ValueError(f"Session {session_id!r} not found")
    return session


def remove_session(session_id: str) -> None:
    with _sessions_lock:
        _sessions.pop(session_id, None)
