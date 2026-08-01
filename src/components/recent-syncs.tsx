"use client";

import { useEffect, useState, useTransition } from "react";

type SyncRow = {
  id: string;
  jiraWorklogId: string;
  jiraIssueKey: string | null;
  jiraSpaceId: string | null;
  eventType: string;
  status: string;
  internalTimesheetId: string | null;
  error: string | null;
  createdAt: string;
};

export function RecentSyncs({ authed }: { authed: boolean }) {
  const [syncs, setSyncs] = useState<SyncRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!authed) return;
    startTransition(async () => {
      const res = await fetch("/api/syncs?limit=15");
      if (!res.ok) {
        setError("Could not load recent syncs");
        return;
      }
      const data = await res.json();
      setSyncs(data.syncs ?? []);
    });
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to view recent sync activity.</p>
    );
  }

  if (pending && syncs.length === 0) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-background text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3 font-medium">Event</th>
            <th className="px-4 py-3 font-medium">Worklog</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {syncs.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-muted">
                No sync events yet.
              </td>
            </tr>
          ) : (
            syncs.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-xs text-muted">
                  {new Date(s.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{s.eventType}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {s.jiraIssueKey ?? "—"} / {s.jiraWorklogId}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      s.status === "synced"
                        ? "bg-ok/10 text-ok"
                        : s.status === "skipped"
                          ? "bg-warning/10 text-warning"
                          : "bg-danger/10 text-danger"
                    }`}
                  >
                    {s.status}
                  </span>
                  {s.error ? (
                    <span className="ml-2 text-xs text-muted">{s.error}</span>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
