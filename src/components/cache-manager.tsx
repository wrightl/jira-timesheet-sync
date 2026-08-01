"use client";

import { useEffect, useState, useTransition } from "react";

type CacheEntry = {
  id: string;
  cacheKey: string;
  resourceType: string;
  requestMeta: unknown;
  fetchedAt: string;
  expiresAt: string;
  bodyPreview: string;
  bodyLength: number;
  expired: boolean;
  responseBody?: unknown;
};

function formatTs(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function CacheManager({ authed }: { authed: boolean }) {
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedBody, setExpandedBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/cache");
      if (!res.ok) {
        setError(res.status === 401 ? "Sign in required" : "Failed to load cache");
        setEntries([]);
        return;
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    });
  };

  useEffect(() => {
    if (authed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const loadBody = (id: string) => {
    startTransition(async () => {
      setError(null);
      const res = await fetch(`/api/cache?includeBody=1`);
      if (!res.ok) {
        setError("Failed to load cache body");
        return;
      }
      const data = await res.json();
      const entry = (data.entries as CacheEntry[]).find((e) => e.id === id);
      if (!entry) {
        setError("Cache entry not found");
        return;
      }
      setExpandedId(id);
      setExpandedBody(
        JSON.stringify(entry.responseBody ?? entry.bodyPreview, null, 2),
      );
    });
  };

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to view cached Bitmap responses.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Projects and project budgets are cached for 24 hours after a successful
          fetch.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-border px-3 py-2 text-sm hover:bg-background disabled:opacity-60"
            onClick={() => load()}
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={pending || entries.length === 0}
            className="rounded-md bg-danger px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-60"
            onClick={() =>
              startTransition(async () => {
                await fetch("/api/cache?all=1", { method: "DELETE" });
                setExpandedId(null);
                setExpandedBody(null);
                load();
              })
            }
          >
            Invalidate all
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Fetched</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  No cached responses yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="max-w-[14rem] truncate px-4 py-3 font-mono text-xs">
                    {entry.cacheKey}
                  </td>
                  <td className="px-4 py-3">{entry.resourceType}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTs(entry.fetchedAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={
                        entry.expired ? "text-warning" : "text-foreground"
                      }
                    >
                      {formatTs(entry.expiresAt)}
                      {entry.expired ? " (expired)" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3">{entry.bodyLength} B</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="mr-3 text-accent hover:underline"
                      onClick={() => {
                        if (expandedId === entry.id) {
                          setExpandedId(null);
                          setExpandedBody(null);
                        } else {
                          loadBody(entry.id);
                        }
                      }}
                    >
                      {expandedId === entry.id ? "Hide" : "View"}
                    </button>
                    <button
                      type="button"
                      className="text-danger hover:underline"
                      onClick={() =>
                        startTransition(async () => {
                          await fetch(`/api/cache?id=${entry.id}`, {
                            method: "DELETE",
                          });
                          if (expandedId === entry.id) {
                            setExpandedId(null);
                            setExpandedBody(null);
                          }
                          load();
                        })
                      }
                    >
                      Invalidate
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {expandedId && expandedBody ? (
        <pre className="max-h-[28rem] overflow-auto rounded-lg border border-border bg-background p-4 text-xs">
          {expandedBody}
        </pre>
      ) : null}
    </div>
  );
}
