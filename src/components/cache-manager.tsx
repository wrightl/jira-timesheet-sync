"use client";

import { useEffect, useState, useTransition } from "react";
import { formatDateTimeUtc } from "@/lib/format-date";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

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
    return formatDateTimeUtc(value);
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
      <p className="text-sm text-muted">
        Sign in to view cached Bitmap responses.
      </p>
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
          <RefreshButton pending={pending} onClick={() => load()} />
          <Button
            type="button"
            variant="danger"
            disabled={pending || entries.length === 0}
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
          </Button>
        </div>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Key</TableHeaderCell>
            <TableHeaderCell>Type</TableHeaderCell>
            <TableHeaderCell>Fetched</TableHeaderCell>
            <TableHeaderCell>Expires</TableHeaderCell>
            <TableHeaderCell>Size</TableHeaderCell>
            <TableHeaderCell />
          </tr>
        </TableHead>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-muted">
                No cached responses yet.
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="max-w-[14rem] truncate font-mono text-xs">
                  {entry.cacheKey}
                </TableCell>
                <TableCell>{entry.resourceType}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatTs(entry.fetchedAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span
                    className={
                      entry.expired ? "text-warning" : "text-foreground"
                    }
                  >
                    {formatTs(entry.expiresAt)}
                    {entry.expired ? " (expired)" : ""}
                  </span>
                </TableCell>
                <TableCell>{entry.bodyLength} B</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <button
                    type="button"
                    className="mr-3 text-sm text-accent hover:underline"
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
                    className="text-sm text-danger hover:underline"
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
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {expandedId && expandedBody ? (
        <pre className="max-h-[28rem] overflow-auto rounded-lg border border-border bg-background p-4 text-xs">
          {expandedBody}
        </pre>
      ) : null}
    </div>
  );
}
