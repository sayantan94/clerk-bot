import { useState, useEffect, useCallback } from 'react';
import type { Message } from '../../../lib/types/messages';

function sendToBackground<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

interface DocumentInfo {
  filename: string;
  size: number;
  parsed: boolean;
  modified: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function DocumentList() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const msg: Message = { type: 'GET_DOCUMENTS' };
      const result = await sendToBackground<{ documents: DocumentInfo[]; total: number } | DocumentInfo[]>(msg);
      const docs = Array.isArray(result) ? result : (result?.documents ?? []);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">Documents</h2>
        <button
          onClick={fetchDocuments}
          disabled={loading}
          className="rounded px-2.5 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 text-xs text-red-600 bg-red-50">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && documents.length === 0 && (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-gray-500">No documents found.</p>
          <p className="mt-1 text-xs text-gray-400">
            Drop files into <span className="font-mono">~/.clerk-bot/documents/</span>
          </p>
        </div>
      )}

      {/* Document list */}
      {documents.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {documents.map((doc) => (
            <li
              key={doc.filename}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <span className="text-base" role="img" aria-label="file">
                {doc.parsed ? '\u{1F4C4}' : '\u{1F4CB}'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {doc.filename}
                </p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(doc.size)} &middot; {formatDate(doc.modified)}
                </p>
              </div>
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  doc.parsed
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {doc.parsed ? 'Parsed' : 'Pending'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
