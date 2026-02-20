/**
 * TypeScript mirrors of the Python learned-preferences Pydantic models.
 *
 * Preferences capture answers the user has given to subjective or
 * site-specific questions so that clerk-bot can reuse them on future forms.
 */

export interface LearnedPreference {
  question: string;
  answer: string;
  source_url?: string;
  learned_at?: string; // ISO-8601 timestamp
  times_used?: number;
}

export interface LearnedPreferences {
  preferences: Record<string, LearnedPreference>;
}
