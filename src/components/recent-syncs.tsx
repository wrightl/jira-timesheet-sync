"use client";

import { useEffect, useState, useTransition } from "react";
import { formatDateTimeUtc } from "@/lib/format-date";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

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

function statusVariant(
  status: string,
): "ok" | "warning" | "accent" | "danger" {
  if (status === "synced") return "ok";
  if (status === "skipped") return "warning";
  if (status === "pending") return "accent";
  return "danger";
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
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setActionError(null);
            load();
          }}
        >
          {pending ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {actionError ? <Alert variant="error">{actionError}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>When</TableHeaderCell>
            <TableHeaderCell>Event</TableHeaderCell>
            <TableHeaderCell>Worklog</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell />
          </tr>
        </TableHead>
        <TableBody>
          {pending && syncs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted">
                Loading…
              </TableCell>
            </TableRow>
          ) : syncs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted">
                No sync events yet.
              </TableCell>
            </TableRow>
          ) : (
            syncs.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted">
                  {formatDateTimeUtc(s.createdAt)}
                </TableCell>
                <TableCell className="font-mono text-xs">{s.eventType}</TableCell>
                <TableCell className="font-mono text-xs">
                  {s.jiraIssueKey ?? "—"} / {s.jiraWorklogId}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                  {s.error ? (
                    <span className="ml-2 text-xs text-muted">{s.error}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  {s.canRetry ? (
                    <button
                      type="button"
                      disabled={retryingId === s.id}
                      className="text-sm text-accent hover:underline disabled:opacity-60"
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
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
