/**
 * Message types for popup <-> background <-> content script communication.
 */

export type MessageType =
  | 'ACTIVATE'
  | 'STOP'
  | 'SET_STATUS'
  | 'ASK_HUMAN'
  | 'ANSWER_HUMAN'
  | 'SCAN_PAGE'
  | 'PAGE_DATA'
  | 'FILL_FIELD'
  | 'CLICK_ELEMENT'
  | 'ACTION_RESULT'
  | 'CHECK_HEALTH'
  | 'GET_PROFILE'
  | 'GET_DOCUMENTS'
  | 'GET_PREFERENCES'
  | 'SAVE_PREFERENCES';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface SetStatusPayload {
  status: 'idle' | 'running' | 'waiting' | 'done' | 'error' | 'stopped';
  message?: string;
}

export interface AskHumanPayload {
  question: string;
  field_context?: string;
  sessionId: string;
}

export interface AnswerHumanPayload {
  sessionId: string;
  answer: string;
}

export interface FillFieldPayload {
  ref: string;
  value: string;
  sessionId: string;
}

export interface ClickElementPayload {
  ref: string;
  sessionId: string;
}

export interface ActionResultPayload {
  sessionId: string;
  result: { ok: boolean; error?: string };
}

export interface PageDataPayload {
  sessionId: string;
  data: {
    url: string;
    title: string;
    fields: Array<{
      ref: string;
      tag: string;
      type: string;
      label: string;
      name: string;
      value: string;
      placeholder: string;
      required: boolean;
      options: string[];
      checked: boolean | null;
    }>;
    buttons: Array<{
      ref: string;
      text: string;
      type: string;
    }>;
  };
}
