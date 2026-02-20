/**
 * Background service worker.
 *
 * The agent runs server-side and communicates via SSE. The background worker:
 * 1. REST proxy — forwards popup dashboard requests to the backend.
 * 2. Autofill trigger — starts a session and relays SSE events to content script.
 * 3. Bridge — relays page data and action results between content script and backend.
 */

import { backendClient } from '../../lib/api/backend-client';
import type {
  Message,
  SetStatusPayload,
  AskHumanPayload,
  AnswerHumanPayload,
  FillFieldPayload,
  ClickElementPayload,
  PageDataPayload,
  ActionResultPayload,
} from '../../lib/types/messages';

export default defineBackground(() => {
  const sessions = new Map<number, { sessionId: string; eventSource: EventSource }>();

  async function handleMessage(
    message: Message,
    sender: chrome.runtime.MessageSender,
  ): Promise<unknown> {
    switch (message.type) {
      case 'ACTIVATE': {
        let tabId = sender.tab?.id;
        if (!tabId) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = activeTab?.id;
        }
        if (!tabId) return { error: 'No tab ID' };

        const existing = sessions.get(tabId);
        if (existing) {
          existing.eventSource.close();
          await backendClient.stopAutofill(existing.sessionId).catch(() => {});
          sessions.delete(tabId);
        }

        try {
          const { session_id } = await backendClient.startAutofill();
          const eventSource = backendClient.createStatusStream(session_id);
          sessions.set(tabId, { sessionId: session_id, eventSource });
          const targetTabId = tabId;

          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              relayEventToContentScript(targetTabId, data);
            } catch {
              // Ignore parse errors
            }
          };

          eventSource.onerror = () => {
            eventSource.close();
            sessions.delete(targetTabId);
          };

          return { ok: true, sessionId: session_id };
        } catch (error) {
          return { error: String(error) };
        }
      }

      case 'STOP': {
        let tabId = sender.tab?.id;
        if (!tabId) {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          tabId = activeTab?.id;
        }
        if (!tabId) return { error: 'No tab ID' };

        const session = sessions.get(tabId);
        if (session) {
          await backendClient.stopAutofill(session.sessionId).catch(() => {});
          session.eventSource.close();
          sessions.delete(tabId);
          chrome.tabs.sendMessage(tabId, {
            type: 'SET_STATUS',
            payload: { status: 'stopped', message: 'Stopped.' } as SetStatusPayload,
          } satisfies Message<SetStatusPayload>).catch(() => {});
        }
        return { ok: true };
      }

      case 'ANSWER_HUMAN': {
        const { sessionId, answer } = message.payload as AnswerHumanPayload;
        await backendClient.answerQuestion(sessionId, answer);
        return { ok: true };
      }

      case 'PAGE_DATA': {
        const { sessionId, data } = message.payload as PageDataPayload;
        await backendClient.sendPageData(sessionId, data);
        return { ok: true };
      }

      case 'ACTION_RESULT': {
        const { sessionId, result } = message.payload as ActionResultPayload;
        await backendClient.sendActionResult(sessionId, result);
        return { ok: true };
      }

      case 'CHECK_HEALTH': {
        try {
          return await backendClient.health();
        } catch (error) {
          return { status: 'error', error: String(error) };
        }
      }

      case 'GET_PROFILE':
        return await backendClient.getProfile();

      case 'GET_DOCUMENTS':
        return await backendClient.getDocuments();

      case 'GET_PREFERENCES':
        return await backendClient.getPreferences();

      case 'SAVE_PREFERENCES': {
        const prefs = message.payload as Record<
          string,
          { question: string; answer: string; source_url?: string }
        >;
        await backendClient.savePreferences(prefs);
        return { success: true };
      }

      default:
        console.warn(`[Clerk-Bot] Unknown message type: ${message.type}`);
        return { error: `Unknown message type: ${message.type}` };
    }
  }

  function relayEventToContentScript(
    tabId: number,
    data: Record<string, unknown>,
  ): void {
    const session = sessions.get(tabId);
    const sessionId = session?.sessionId ?? '';

    switch (data.type) {
      case 'scan_request':
        chrome.tabs.sendMessage(tabId, {
          type: 'SCAN_PAGE',
          payload: { sessionId },
        } satisfies Message).catch(() => {});
        break;

      case 'fill_field': {
        const payload: FillFieldPayload = {
          ref: data.ref as string,
          value: data.value as string,
          sessionId,
        };
        chrome.tabs.sendMessage(tabId, {
          type: 'FILL_FIELD',
          payload,
        } satisfies Message<FillFieldPayload>).catch(() => {});
        break;
      }

      case 'click_element': {
        const payload: ClickElementPayload = {
          ref: data.ref as string,
          sessionId,
        };
        chrome.tabs.sendMessage(tabId, {
          type: 'CLICK_ELEMENT',
          payload,
        } satisfies Message<ClickElementPayload>).catch(() => {});
        break;
      }

      case 'ask_human': {
        const payload: AskHumanPayload = {
          question: data.message as string,
          field_context: data.field_context as string | undefined,
          sessionId,
        };
        chrome.tabs.sendMessage(tabId, {
          type: 'ASK_HUMAN',
          payload,
        } satisfies Message<AskHumanPayload>).catch(() => {});
        break;
      }

      default: {
        const statusMap: Record<string, SetStatusPayload['status']> = {
          running: 'running',
          waiting_for_human: 'waiting',
          done: 'done',
          error: 'error',
          stopped: 'stopped',
          idle: 'idle',
        };
        const payload: SetStatusPayload = {
          status: statusMap[data.state as string] ?? 'running',
          message: data.message as string,
        };
        chrome.tabs.sendMessage(tabId, {
          type: 'SET_STATUS',
          payload,
        } satisfies Message<SetStatusPayload>).catch(() => {});
        break;
      }
    }
  }

  chrome.runtime.onMessage.addListener(
    (message: Message, sender, sendResponse) => {
      handleMessage(message, sender)
        .then(sendResponse)
        .catch((err) => {
          console.error('[Clerk-Bot] Message handler error:', err);
          sendResponse({ error: String(err) });
        });
      return true;
    },
  );

  chrome.tabs.onRemoved.addListener((tabId) => {
    const session = sessions.get(tabId);
    if (session) {
      session.eventSource.close();
      backendClient.stopAutofill(session.sessionId).catch(() => {});
      sessions.delete(tabId);
    }
  });
});
