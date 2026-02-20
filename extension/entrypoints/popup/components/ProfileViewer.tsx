import { useState, useEffect, useCallback } from 'react';
import type { Message } from '../../../lib/types/messages';

function sendToBackground<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
import type {
  UserProfile,
  Education,
  WorkExperience,
  IdentificationDocument,
} from '../../../lib/types/profile';

/** Filter out null/undefined/empty values from an object for display. */
function nonNullEntries(obj: Record<string, unknown>): [string, string][] {
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      if (typeof v === 'object' && !Array.isArray(v)) {
        // Flatten nested objects like Address
        return Object.entries(v as Record<string, unknown>)
          .filter(([, sv]) => sv !== null && sv !== undefined && sv !== '')
          .map(([sk, sv]) => [formatLabel(sk), String(sv)] as [string, string]);
      }
      return [[formatLabel(k), String(v)] as [string, string]];
    })
    .flat();
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-gray-100 px-3 py-2.5">{children}</div>}
    </div>
  );
}

function KeyValueGrid({ entries }: { entries: [string, string][] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 italic">No data</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-xs font-medium text-gray-500 whitespace-nowrap">{key}</dt>
          <dd className="text-xs text-gray-800 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EducationCard({ edu, index }: { edu: Education; index: number }) {
  const entries = nonNullEntries(edu as unknown as Record<string, unknown>);
  return (
    <div className={index > 0 ? 'mt-2 border-t border-gray-100 pt-2' : ''}>
      <KeyValueGrid entries={entries} />
    </div>
  );
}

function WorkCard({ work, index }: { work: WorkExperience; index: number }) {
  const entries = nonNullEntries(work as unknown as Record<string, unknown>);
  return (
    <div className={index > 0 ? 'mt-2 border-t border-gray-100 pt-2' : ''}>
      <KeyValueGrid entries={entries} />
    </div>
  );
}

function IdCard({ doc, index }: { doc: IdentificationDocument; index: number }) {
  const entries = nonNullEntries(doc as unknown as Record<string, unknown>);
  return (
    <div className={index > 0 ? 'mt-2 border-t border-gray-100 pt-2' : ''}>
      <KeyValueGrid entries={entries} />
    </div>
  );
}

export function ProfileViewer() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const msg: Message = { type: 'GET_PROFILE' };
      const result = await sendToBackground<UserProfile>(msg);
      setProfile(result ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch profile');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const msg: Message = { type: 'GET_PROFILE', payload: { refresh: true } };
      const result = await sendToBackground<UserProfile>(msg);
      setProfile(result ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh profile');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const isEmpty =
    !profile ||
    (!profile.personal &&
      !profile.education?.length &&
      !profile.work_experience?.length &&
      !profile.skills?.length &&
      !profile.identification?.length);

  const personalEntries = profile?.personal
    ? nonNullEntries(profile.personal as unknown as Record<string, unknown>)
    : [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">User Profile</h2>
        <button
          onClick={refreshProfile}
          disabled={refreshing || loading}
          className="rounded px-2.5 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh Profile'}
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
        <div className="py-8 text-center text-sm text-gray-400">Loading profile...</div>
      )}

      {/* Empty */}
      {!loading && isEmpty && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center">
          <p className="text-sm text-gray-500">No profile yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Add documents to <span className="font-mono">~/.clerk-bot/documents/</span> and
            click Refresh Profile.
          </p>
        </div>
      )}

      {/* Profile sections */}
      {!loading && !isEmpty && (
        <div className="space-y-2">
          {/* Personal Info */}
          {personalEntries.length > 0 && (
            <Section title="Personal Info" defaultOpen>
              <KeyValueGrid entries={personalEntries} />
            </Section>
          )}

          {/* Education */}
          {profile!.education && profile!.education.length > 0 && (
            <Section title={`Education (${profile!.education.length})`}>
              {profile!.education.map((edu, i) => (
                <EducationCard key={i} edu={edu} index={i} />
              ))}
            </Section>
          )}

          {/* Work Experience */}
          {profile!.work_experience && profile!.work_experience.length > 0 && (
            <Section title={`Work Experience (${profile!.work_experience.length})`}>
              {profile!.work_experience.map((work, i) => (
                <WorkCard key={i} work={work} index={i} />
              ))}
            </Section>
          )}

          {/* Skills */}
          {profile!.skills && profile!.skills.length > 0 && (
            <Section title={`Skills (${profile!.skills.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {profile!.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Identification */}
          {profile!.identification && profile!.identification.length > 0 && (
            <Section title={`IDs (${profile!.identification.length})`}>
              {profile!.identification.map((doc, i) => (
                <IdCard key={i} doc={doc} index={i} />
              ))}
            </Section>
          )}

          {/* Last updated */}
          {profile!.last_updated && (
            <p className="text-right text-[10px] text-gray-400">
              Last updated: {new Date(profile!.last_updated).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
