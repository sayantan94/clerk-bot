"""Autofill API endpoints.

Manages the agent lifecycle and content script communication:
- POST /api/autofill/start        -> start a new autofill session
- GET  /api/autofill/status       -> SSE stream of status updates
- POST /api/autofill/answer       -> provide a human answer to a question
- POST /api/autofill/page-data    -> content script sends scanned form data
- POST /api/autofill/action-result -> content script confirms action execution
- POST /api/autofill/stop         -> stop the current session
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.autofill_session import create_session, get_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["autofill"])


class StartResponse(BaseModel):
    session_id: str


class AnswerRequest(BaseModel):
    session_id: str
    answer: str


class StopRequest(BaseModel):
    session_id: str


class PageDataRequest(BaseModel):
    session_id: str
    data: dict[str, Any]


class ActionResultRequest(BaseModel):
    session_id: str
    result: dict[str, Any]


@router.post("/autofill/start", response_model=StartResponse)
async def start_autofill():
    """Start a new autofill session.

    Creates the Strands agent in a background thread. The agent will
    immediately request a page scan via SSE — the content script should
    be listening for 'scan_request' events.
    """
    session = create_session()
    session.start()
    logger.info("Started autofill session %s", session.id)
    return StartResponse(session_id=session.id)


@router.get("/autofill/status")
async def autofill_status(session_id: str):
    """SSE stream of status updates for an autofill session.

    Events include:
    - started: session has begun
    - running: agent is actively working
    - scan_request: agent wants the content script to scan the page
    - fill_field: agent wants to fill a field (includes ref + value)
    - click_element: agent wants to click a button (includes ref)
    - ask_human: agent needs human input (includes question)
    - resumed: agent resumed after human answer
    - done: form filling complete
    - error: something went wrong
    - stopped: session was stopped by user
    """
    try:
        session = get_session(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Session {session_id!r} not found")

    return StreamingResponse(
        session.status_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/autofill/answer")
async def provide_answer(req: AnswerRequest):
    """Provide a human answer to the agent's question."""
    try:
        session = get_session(req.session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Session {req.session_id!r} not found")

    try:
        session.provide_answer(req.answer)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    return {"ok": True}


@router.post("/autofill/page-data")
async def receive_page_data(req: PageDataRequest):
    """Receive scanned form data from the content script.

    Called by the extension after a 'scan_request' SSE event. The data
    should contain url, title, fields[], and buttons[] describing the
    current form state.
    """
    try:
        session = get_session(req.session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Session {req.session_id!r} not found")

    session.provide_page_data(req.data)
    return {"ok": True}


@router.post("/autofill/action-result")
async def receive_action_result(req: ActionResultRequest):
    """Receive action execution result from the content script.

    Called by the extension after executing a fill_field or click_element
    action. The result should contain {ok: true} or {error: "message"}.
    """
    try:
        session = get_session(req.session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Session {req.session_id!r} not found")

    session.provide_action_result(req.result)
    return {"ok": True}


@router.post("/autofill/stop")
async def stop_autofill(req: StopRequest):
    """Stop a running autofill session."""
    try:
        session = get_session(req.session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Session {req.session_id!r} not found")

    session.stop()
    logger.info("Stopped autofill session %s", session.id)
    return {"ok": True}
