import { useState, useCallback } from 'react';
import { StatusIndicator } from './components/StatusIndicator';
import { DocumentList } from './components/DocumentList';
import { ProfileViewer } from './components/ProfileViewer';
import { PreferencesManager } from './components/PreferencesManager';

function ActivateButton() {
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');

  const handleActivate = async () => {
    try {
      // Send to background worker which starts the Navigator state machine
      await chrome.runtime.sendMessage({ type: 'ACTIVATE' });
      setState('sent');
      // Close popup after a beat
      setTimeout(() => window.close(), 500);
    } catch {
      setState('error');
    }
  };

  return (
    <button
      onClick={handleActivate}
      disabled={state === 'sent'}
      className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
    >
      {state === 'idle' && 'Fill this page'}
      {state === 'sent' && 'Activated!'}
      {state === 'error' && 'Failed — reload the page & try again'}
    </button>
  );
}

type Tab = 'status' | 'documents' | 'profile' | 'preferences';

interface TabConfig {
  id: Tab;
  label: string;
}

const TABS: TabConfig[] = [
  { id: 'status', label: 'Status' },
  { id: 'documents', label: 'Documents' },
  { id: 'profile', label: 'Profile' },
  { id: 'preferences', label: 'Preferences' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
  }, []);

  return (
    <div className="flex min-h-[480px] flex-col bg-gray-50">
      {/* Header + Activate */}
      <header className="bg-indigo-600 px-4 pb-4 pt-4">
        <h1 className="text-base font-bold text-white">Clerk-Bot</h1>
        <p className="mt-0.5 text-xs text-indigo-200">
          AI-Powered Universal Form Auto-Filler
        </p>
        <div className="mt-3">
          <ActivateButton />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="flex border-b border-gray-200 bg-white">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 px-2 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main className="flex-1 overflow-y-auto p-4">
        {activeTab === 'status' && <StatusIndicator />}
        {activeTab === 'documents' && <DocumentList />}
        {activeTab === 'profile' && <ProfileViewer />}
        {activeTab === 'preferences' && <PreferencesManager />}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-4 py-2 text-center">
        <p className="text-[10px] text-gray-400">
          clerk-bot &middot; localhost:8394
        </p>
      </footer>
    </div>
  );
}
