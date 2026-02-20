import { useState, useEffect, useCallback } from 'react';
import type { Message } from '../../../lib/types/messages';

function sendToBackground<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

type ConnectionStatus = 'checking' | 'connected' | 'disconnected';

interface HealthData {
  status: string;
  version?: string;
  documents_count?: number;
  preferences_count?: number;
}

const POLL_INTERVAL_MS = 10_000;

export function StatusIndicator() {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [health, setHealth] = useState<HealthData | null>(null);

  const checkHealth = useCallback(async () => {
    try {
      const msg: Message = { type: 'CHECK_HEALTH' };
      const result = await sendToBackground<HealthData>(msg);
      if (result?.status === 'ok') {
        setStatus('connected');
        setHealth(result);
      } else {
        setStatus('disconnected');
        setHealth(null);
      }
    } catch {
      setStatus('disconnected');
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    checkHealth();

    const interval = setInterval(checkHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const dotColor =
    status === 'connected'
      ? 'bg-green-500'
      : status === 'disconnected'
        ? 'bg-red-500'
        : 'bg-yellow-500';

  const statusText =
    status === 'connected'
      ? 'Connected'
      : status === 'disconnected'
        ? 'Disconnected'
        : 'Checking...';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2.5">
        <span className={`inline-block h-3 w-3 rounded-full ${dotColor}`} />
        <span className="text-sm font-medium text-gray-800">{statusText}</span>
        {health?.version && (
          <span className="ml-auto text-xs text-gray-400">v{health.version}</span>
        )}
      </div>

      {status === 'connected' && health && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-md bg-gray-50 px-3 py-2 text-center">
            <p className="text-lg font-semibold text-indigo-600">
              {health.documents_count ?? 0}
            </p>
            <p className="text-xs text-gray-500">Documents</p>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2 text-center">
            <p className="text-lg font-semibold text-indigo-600">
              {health.preferences_count ?? 0}
            </p>
            <p className="text-xs text-gray-500">Preferences</p>
          </div>
        </div>
      )}

      {status === 'disconnected' && (
        <p className="mt-2 text-xs text-gray-500">
          Make sure the clerk-bot backend is running on{' '}
          <span className="font-mono text-gray-600">localhost:8394</span>
        </p>
      )}
    </div>
  );
}
