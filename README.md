<p align="center">
  <img src="extension/public/icon-128.png" alt="Clerk-Bot" width="80" />
</p>

<h1 align="center">Clerk-Bot</h1>

<p align="center">
  <strong>AI-Powered Universal Form Auto-Filler</strong><br>
  Chrome extension + local Python backend that parses your documents and auto-fills any form on any website.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10+-blue?logo=python&logoColor=white" alt="Python 3.10+" />
  <img src="https://img.shields.io/badge/chrome-MV3-green?logo=googlechrome&logoColor=white" alt="Chrome MV3" />
  <img src="https://img.shields.io/badge/AI-Claude%20%7C%20GPT--4o%20%7C%20Bedrock-purple" alt="AI Models" />
  <img src="https://img.shields.io/badge/license-MIT-gray" alt="License" />
</p>

---

## How It Works

You navigate to a form, click "Auto-fill", and the AI fills everything.

1. The **content script** scans the page and sends a snapshot of all form fields to the backend
2. The **AI agent** loads your profile (parsed from your documents) and learned preferences
3. It fills fields it knows — name, email, education, work history, etc.
4. For anything it doesn't know, it asks you via the browser overlay
5. Your answers are saved so it doesn't ask again next time
6. It clicks Next/Submit and repeats for multi-page forms

All data stays local on your machine (`~/.clerk-bot/`). The only external call is to your chosen AI provider.

---

## Architecture

```mermaid
sequenceDiagram
    actor User
    participant Overlay as Overlay (Shadow DOM)
    participant CS as Content Script
    participant BG as Background Worker
    participant Server as FastAPI (SSE + REST)
    participant Agent as AI Agent (Python thread)
    participant LLM as Claude / GPT-4o / Bedrock

    User->>Overlay: Clicks "Auto-fill"
    Overlay->>CS: onAutoFill()
    CS->>BG: ACTIVATE message
    BG->>Server: POST /api/autofill/start
    Server->>Agent: spawns background thread
    BG->>Server: GET /api/autofill/status (opens SSE stream)

    Note over Server,BG: SSE stream stays open for the entire session.<br/>Backend pushes events, browser listens.

        Note over Agent,LLM: Agent decides to scan the page
        Agent->>LLM: "What tools should I call?"
        LLM-->>Agent: scan_page()
        Agent->>Server: pushes scan_request to SSE queue (blocks, waiting)
        Server-->>BG: SSE event: scan_request
        BG->>CS: SCAN_PAGE message
        CS->>CS: scanPage() — reads all form fields from DOM
        CS->>BG: PAGE_DATA message (fields, labels, buttons)
        BG->>Server: POST /api/autofill/page-data
        Server->>Agent: unblocks thread with form snapshot

        Note over Agent,LLM: Agent decides to fill fields
        Agent->>LLM: form snapshot + user profile + preferences
        LLM-->>Agent: fill_field("f0", "John"), fill_field("f1", "john@example.com"), ...

        loop Each field the agent wants to fill
            Agent->>Server: pushes fill_field to SSE queue (blocks)
            Server-->>BG: SSE event: fill_field {ref, value}
            BG->>CS: FILL_FIELD message
            CS->>CS: fillFieldByRef() — writes value into DOM input
            CS->>BG: ACTION_RESULT {ok: true}
            BG->>Server: POST /api/autofill/action-result
            Server->>Agent: unblocks thread with confirmation
        end

        Note over Agent,User: Agent doesn't know an answer — asks the human
        Agent->>Server: pushes ask_human to SSE queue (blocks)
        Server-->>BG: SSE event: ask_human {question}
        BG->>CS: ASK_HUMAN message
        CS->>Overlay: showQuestion("What is your desired salary?")
        User->>Overlay: Types answer, clicks Submit
        Overlay->>CS: answer string
        CS->>BG: ANSWER_HUMAN message
        BG->>Server: POST /api/autofill/answer
        Server->>Agent: unblocks thread with answer
        Note over Agent: Saves answer to preferences for next time

        Note over Agent,LLM: Agent clicks Next / Submit
        Agent->>LLM: "All fields filled, what next?"
        LLM-->>Agent: click_element("b0")
        Agent->>Server: pushes click_element to SSE queue (blocks)
        Server-->>BG: SSE event: click_element {ref}
        BG->>CS: CLICK_ELEMENT message
        CS->>CS: clickElementByRef() — clicks button in DOM
        CS->>BG: ACTION_RESULT {ok: true}
        BG->>Server: POST /api/autofill/action-result
        Server->>Agent: unblocks thread
        Note over Agent: Loops back to scan_page for next page

    Agent->>Server: pushes done to SSE queue
    Server-->>BG: SSE event: done
    BG->>CS: SET_STATUS message
    CS->>Overlay: setStatus("done")
```

---

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+ (for building the extension)
- An API key from [Anthropic](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/), or AWS Bedrock

### 1. Set Up the Backend

```bash
cd backend
pip install -e .

# First-time setup — creates ~/.clerk-bot/ and configures your API key
clerk-bot init
```

### 2. Add Your Documents

```bash
# Drop your resume, passport, license, insurance card, etc.
cp ~/resume.pdf ~/.clerk-bot/documents/
cp ~/passport.jpg ~/.clerk-bot/documents/
```

Supported formats: PDF, PNG, JPG, TXT, Markdown

### 3. Start the Server

```bash
clerk-bot start
# → Server runs at http://localhost:8394
```

### 4. Build & Install the Chrome Extension

```bash
cd extension
npm install
npx wxt build
```

Load in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/.output/chrome-mv3` folder

### 5. Fill a Form

1. Navigate to any website with a form
2. Click the Clerk-Bot extension icon
3. Click **Auto-fill**
4. Watch the overlay — answer any questions the agent asks
5. Done! Your answers are saved for next time.

---

## Configuration

All config lives in `~/.clerk-bot/.env`:

```env
# Model provider: anthropic (default) | openai | bedrock
CLERK_MODEL_PROVIDER=anthropic

# Model ID (optional — defaults to claude-haiku-4-5)
CLERK_ANTHROPIC_MODEL=claude-haiku-4-5

# API keys (set the one matching your provider)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AWS_PROFILE=default

# Server port (optional)
CLERK_PORT=8394
```

---

## CLI Commands

```bash
clerk-bot init     # First-time setup wizard
clerk-bot start    # Start the backend server
clerk-bot status   # Check server health, documents, profile
```

---

## Development

### Backend

```bash
cd backend
pip install -e .
clerk-bot start    # runs with auto-reload via uvicorn
```

### Extension

```bash
cd extension
npm install
npx wxt dev        # hot-reload development mode
```

Load the dev build from `extension/.output/chrome-mv3-dev`.

---

## Disclaimer

Clerk-Bot uses AI to fill forms. AI can make mistakes, it may fill fields incorrectly, misinterpret labels, or enter wrong values. Always review what the agent has filled before submitting any form. You are responsible for verifying the accuracy of all submitted data. This tool is provided as-is with no warranty.
