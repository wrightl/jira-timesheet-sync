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
  canRetry?: boolean;
};

function statusClass(status: string) {
  if (status === "synced") return "bg-ok/10 text-ok";
  if (status === "skipped") return "bg-warning/10 text-warning";
  if (status === "pending") return "bg-accent/10 text-accent";
  return "bg-danger/10 text-danger";
}

export function RecentSyncs({ authed }: { authed: boolean }) {
  const [syncs, setSyncs] = useState<SyncRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/syncs?limit=50");
      if (!res.ok) {
        setError("Could not load recent syncs");
        return;
      }
      const data = await res.json();
      setSyncs(data.syncs ?? []);
    });
  };

  useEffect(() => {
    if (!authed) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const hasPending = syncs.some((s) => s.status === "pending");
    if (!hasPending) return;
    const timer = setInterval(() => {
      void fetch("/api/syncs?limit=50")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.syncs) setSyncs(data.syncs);
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [authed, syncs]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to view recent sync activity.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
          onClick={() => {
            setActionError(null);
            load();
          }}
        >
          {pending ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {actionError ? (
        <p className="text-sm text-danger">{actionError}</p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Worklog</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {pending && syncs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            ) : syncs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  No sync events yet.
                </td>
              </tr>
            ) : (
              syncs.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{s.eventType}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {s.jiraIssueKey ?? "—"} / {s.jiraWorklogId}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs ${statusClass(s.status)}`}
                    >
                      {s.status}
                    </span>
                    {s.error ? (
                      <span className="ml-2 text-xs text-muted">{s.error}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.canRetry ? (
                      <button
                        type="button"
                        disabled={retryingId === s.id}
                        className="text-accent hover:underline disabled:opacity-60"
                        onClick={() => {
                          setActionError(null);
                          setRetryingId(s.id);
                          startTransition(async () => {
                            const res = await fetch(
                              `/api/syncs?action=retry&id=${s.id}`,
                              { method: "POST" },
                            );
                            const data = await res.json().catch(() => ({}));
                            setRetryingId(null);
                            if (!res.ok) {
                              setActionError(data.error ?? "Retry failed");
                              return;
                            }
                            load();
                          });
                        }}
                      >
                        {retryingId === s.id ? "Retrying…" : "Retry"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
