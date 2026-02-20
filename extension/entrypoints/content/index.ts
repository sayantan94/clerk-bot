/**
 * Content script — DOM scanning, form filling, and status overlay.
 *
 * The agent communicates via SSE events relayed through the background worker.
 * This content script scans form fields, fills values, clicks elements,
 * and shows a status overlay with agent progress and question prompts.
 */

import { defineContentScript } from 'wxt/sandbox';
import { ClerkBotOverlay } from '@/lib/content/overlay-ui';
import { scanPage, fillFieldByRef, clickElementByRef } from '@/lib/content/dom-scanner';
import type {
  Message,
  SetStatusPayload,
  AskHumanPayload,
  FillFieldPayload,
  ClickElementPayload,
} from '@/lib/types/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let overlay: ClerkBotOverlay | null = null;

    function ensureOverlay(): ClerkBotOverlay {
      if (!overlay) {
        overlay = new ClerkBotOverlay();
        overlay.onAutoFill = () => chrome.runtime.sendMessage({ type: 'ACTIVATE' });
        overlay.onStop = () => chrome.runtime.sendMessage({ type: 'STOP' });
        overlay.mount();
      }
      return overlay;
    }

    chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
      handleCommand(message)
        .then(sendResponse)
        .catch((err) => {
          console.error('[Clerk-Bot Content] Error:', err);
          sendResponse({ error: String(err) });
        });
      return true;
    });

    async function handleCommand(message: Message): Promise<unknown> {
      switch (message.type) {
        case 'SET_STATUS': {
          const { status, message: msg } = message.payload as SetStatusPayload;
          ensureOverlay().setStatus(status, msg);
          return { ok: true };
        }

        case 'SCAN_PAGE': {
          const { sessionId } = message.payload as { sessionId: string };
          ensureOverlay().setStatus('running', 'Scanning form fields...');

          const snapshot = scanPage();
          console.log(
            `[Clerk-Bot] Scanned: ${snapshot.fields.length} fields, ${snapshot.buttons.length} buttons`,
          );

          chrome.runtime.sendMessage({
            type: 'PAGE_DATA',
            payload: { sessionId, data: snapshot },
          });
          return { ok: true };
        }

        case 'FILL_FIELD': {
          const { ref, value, sessionId } = message.payload as FillFieldPayload;
          ensureOverlay().setStatus('running', `Filling ${ref}...`);

          const result = fillFieldByRef(ref, value);
          chrome.runtime.sendMessage({
            type: 'ACTION_RESULT',
            payload: { sessionId, result },
          });
          return { ok: true };
        }

        case 'CLICK_ELEMENT': {
          const { ref, sessionId } = message.payload as ClickElementPayload;
          ensureOverlay().setStatus('running', `Clicking ${ref}...`);

          const result = clickElementByRef(ref);
          chrome.runtime.sendMessage({
            type: 'ACTION_RESULT',
            payload: { sessionId, result },
          });
          return { ok: true };
        }

        case 'ASK_HUMAN': {
          const { question, sessionId } = message.payload as AskHumanPayload;
          const answer = await ensureOverlay().showQuestion(question);
          chrome.runtime.sendMessage({
            type: 'ANSWER_HUMAN',
            payload: { sessionId, answer },
          });
          return { ok: true };
        }

        default:
          return { error: `Unknown command: ${message.type}` };
      }
    }
  },
});
