import { useState, useEffect, useCallback } from 'react';
import type { Message } from '../../../lib/types/messages';

function sendToBackground<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
import type { LearnedPreference, LearnedPreferences } from '../../../lib/types/preferences';

export function PreferencesManager() {
  const [preferences, setPreferences] = useState<Record<string, LearnedPreference>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const msg: Message = { type: 'GET_PREFERENCES' };
      const result = await sendToBackground<LearnedPreferences>(msg);
      setPreferences(result?.preferences ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch preferences');
      setPreferences({});
    } finally {
      setLoading(false);
    }
  }, []);

  const deletePreference = useCallback(
    async (key: string) => {
      setDeletingKey(key);
      try {
        const msg: Message = {
          type: 'SAVE_PREFERENCES',
          payload: { action: 'delete', key },
        };
        await sendToBackground(msg);
        setPreferences((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete preference');
      } finally {
        setDeletingKey(null);
      }
    },
    [],
  );

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const entries = Object.entries(preferences);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">Preferences</h2>
          {!loading && entries.length > 0 && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
              {entries.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchPreferences}
          disabled={loading}
          className="rounded px-2.5 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-8 text-center text-sm text-gray-400">
          Loading preferences...
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && !error && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center">
          <p className="text-sm text-gray-500">No learned preferences yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Fill some forms to start learning!
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && entries.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-2 font-semibold text-gray-600">Question</th>
                <th className="px-3 py-2 font-semibold text-gray-600">Answer</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map(([key, pref]) => (
                <tr key={key} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 text-gray-700 max-w-[140px]">
                    <p className="truncate" title={pref.question}>
                      {pref.question}
                    </p>
                    {pref.source_url && (
                      <p
                        className="mt-0.5 truncate text-[10px] text-gray-400"
                        title={pref.source_url}
                      >
                        {pref.source_url}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-800 max-w-[120px]">
                    <p className="truncate" title={pref.answer}>
                      {pref.answer}
                    </p>
                    {pref.times_used !== undefined && pref.times_used > 0 && (
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        Used {pref.times_used}x
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => deletePreference(key)}
                      disabled={deletingKey === key}
                      title="Delete preference"
                      className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      {deletingKey === key ? (
                        <span className="inline-block h-3.5 w-3.5 text-[10px]">...</span>
                      ) : (
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
