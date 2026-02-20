/**
 * Typed HTTP client for the clerk-bot backend at localhost:8394.
 */

import type { UserProfile } from '../types/profile';
import type { LearnedPreferences } from '../types/preferences';

const BASE_URL = 'http://localhost:8394/api';

export interface HealthResponse {
  status: string;
  version?: string;
}

export interface DocumentInfo {
  filename: string;
  size?: number;
  uploaded_at?: string;
}

export interface StartAutofillResponse {
  session_id: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Backend ${url}: ${response.status} ${response.statusText} - ${body}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const backendClient = {
  async health(): Promise<HealthResponse> {
    return request<HealthResponse>('/health');
  },

  async getProfile(): Promise<UserProfile> {
    return request<UserProfile>('/profile');
  },

  async refreshProfile(): Promise<UserProfile> {
    return request<UserProfile>('/profile/refresh', { method: 'POST' });
  },

  async getDocuments(): Promise<DocumentInfo[]> {
    return request<DocumentInfo[]>('/documents');
  },

  async getPreferences(): Promise<LearnedPreferences> {
    return request<LearnedPreferences>('/preferences');
  },

  async savePreferences(
    prefs: Record<string, { question: string; answer: string; source_url?: string }>,
  ): Promise<void> {
    return request<void>('/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences: prefs }),
    });
  },

  async deletePreference(key: string): Promise<void> {
    return request<void>(`/preferences/${encodeURIComponent(key)}`, { method: 'DELETE' });
  },

  async startAutofill(): Promise<StartAutofillResponse> {
    return request<StartAutofillResponse>('/autofill/start', { method: 'POST' });
  },

  async stopAutofill(sessionId: string): Promise<void> {
    return request<void>('/autofill/stop', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId }),
    });
  },

  async answerQuestion(sessionId: string, answer: string): Promise<void> {
    return request<void>('/autofill/answer', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, answer }),
    });
  },

  async sendPageData(sessionId: string, data: Record<string, unknown>): Promise<void> {
    return request<void>('/autofill/page-data', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, data }),
    });
  },

  async sendActionResult(sessionId: string, result: { ok: boolean; error?: string }): Promise<void> {
    return request<void>('/autofill/action-result', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, result }),
    });
  },

  createStatusStream(sessionId: string): EventSource {
    const url = `${BASE_URL}/autofill/status?session_id=${encodeURIComponent(sessionId)}`;
    return new EventSource(url);
  },
};
