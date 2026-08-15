"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
} from "@/components/ui/table";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Toggle } from "@/components/ui/toggle";
import {
  isTriagedStatus,
  metricsFromTickets,
} from "@/lib/support-ticket-metrics";

const RESPONSE_SLA_HOURS = 8;

type SupportTicket = {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  assigneeEmail: string | null;
  created: string | null;
  updated: string | null;
  browseUrl: string | null;
  lastActivity: string | null;
  lastActivityAt: string | null;
  hoursSinceActivity: number | null;
  responseCycleHours: number[];
};

type SupportTicketMetrics = {
  totalCount: number;
  averageResponseTimeHours: number | null;
  ticketsByAssignee: Record<string, number>;
};

type TicketsData = {
  tickets: SupportTicket[];
  metrics: SupportTicketMetrics;
};

function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)} hours`;
  }
  const days = hours / 24;
  return `${days.toFixed(1)} days`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

function getStatusBadgeVariant(
  status: string,
): "ok" | "warning" | "danger" | "accent" | "muted" {
  const lower = status.toLowerCase();
  if (lower.includes("done") || lower.includes("closed")) return "ok";
  if (lower.includes("progress")) return "warning";
  if (lower.includes("blocked")) return "danger";
  return "muted";
}

function formatIdleHours(hours: number | null): string {
  if (hours == null) return "—";
  return hours.toFixed(1);
}

function getIdleBadgeVariant(
  hours: number | null,
): "ok" | "warning" | "danger" | "muted" {
  if (hours == null) return "muted";
  if (hours >= 48) return "danger";
  if (hours >= 24) return "warning";
  return "ok";
}

export function SupportTicketsContent() {
  const [data, setData] = useState<TicketsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showTriaged, setShowTriaged] = useState(false);

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/support-tickets");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to load support tickets");
        setData(null);
        return;
      }
      const json = (await res.json()) as TicketsData;
      setData(json);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const visibleTickets = useMemo(() => {
    if (!data) return [];
    if (showTriaged) return data.tickets;
    return data.tickets.filter((ticket) => !isTriagedStatus(ticket.status));
  }, [data, showTriaged]);

  const metrics = useMemo(
    () => metricsFromTickets(visibleTickets),
    [visibleTickets],
  );

  if (error) {
    return (
      <Alert variant="error" className="mt-6">
        {error}
      </Alert>
    );
  }

  if (!data) {
    return <p className="mt-6 text-sm text-muted">Loading tickets…</p>;
  }

  const sortedAssignees = Object.entries(metrics.ticketsByAssignee).sort(
    (a, b) => b[1] - a[1],
  );

  const slaBreached =
    metrics.averageResponseTimeHours !== null &&
    metrics.averageResponseTimeHours > RESPONSE_SLA_HOURS;
  const slaWithin =
    metrics.averageResponseTimeHours !== null && !slaBreached;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Metrics</h2>
        <RefreshButton onClick={load} pending={pending} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle className="mb-2 text-sm text-muted">
            Total Tickets
          </CardTitle>
          <p className="text-3xl font-bold">{metrics.totalCount}</p>
        </Card>

        <Card
          className={
            slaBreached ? "border-danger/30 bg-danger/5" : undefined
          }
        >
          <CardTitle className="mb-2 text-sm text-muted">
            Avg Response Time
          </CardTitle>
          <p className="mb-1 text-xs text-muted">
            Weekdays 8am–5pm UK time, to Waiting for customer or Done
          </p>
          <p
            className={
              slaBreached
                ? "text-3xl font-bold text-danger"
                : "text-3xl font-bold"
            }
          >
            {metrics.averageResponseTimeHours !== null
              ? formatHours(metrics.averageResponseTimeHours)
              : "—"}
          </p>
          {slaBreached ? (
            <Badge variant="danger" className="mt-2">
              Over 8h SLA
            </Badge>
          ) : slaWithin ? (
            <Badge variant="ok" className="mt-2">
              Within 8h SLA
            </Badge>
          ) : null}
        </Card>

        <Card>
          <CardTitle className="mb-2 text-sm text-muted">
            Tickets by Assignee
          </CardTitle>
          <dl className="space-y-1 text-sm">
            {sortedAssignees.slice(0, 5).map(([assignee, count]) => (
              <div key={assignee} className="flex justify-between">
                <dt className="truncate">{assignee}</dt>
                <dd className="font-semibold">{count}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Open Tickets</h2>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Toggle
              checked={showTriaged}
              onCheckedChange={setShowTriaged}
              label="Show Triaged tickets"
            />
            Show Triaged
          </div>
        </div>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Key</TableHeaderCell>
              <TableHeaderCell>Summary</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Idle (hours)</TableHeaderCell>
              <TableHeaderCell>Last activity</TableHeaderCell>
              <TableHeaderCell>Assignee</TableHeaderCell>
              <TableHeaderCell>Updated</TableHeaderCell>
            </TableRow>
          </TableHead>
            <TableBody>
              {visibleTickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted">
                    {showTriaged
                      ? "No open tickets."
                      : "No open tickets. Turn on Show Triaged to include Triaged tickets."}
                  </TableCell>
                </TableRow>
              ) : (
                visibleTickets.map((ticket) => (
                <TableRow key={ticket.key}>
                  <TableCell className="font-mono text-sm">
                    {ticket.browseUrl ? (
                      <a
                        href={ticket.browseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
                      >
                        {ticket.key}
                      </a>
                    ) : (
                      ticket.key
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="truncate" title={ticket.summary}>
                      {ticket.summary}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(ticket.status)}>
                      {ticket.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getIdleBadgeVariant(ticket.hoursSinceActivity)}>
                      {formatIdleHours(ticket.hoursSinceActivity)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    {ticket.lastActivity ? (
                      <div>
                        <div
                          className="truncate"
                          title={ticket.lastActivity}
                        >
                          {ticket.lastActivity}
                        </div>
                        <div className="text-xs text-muted">
                          {formatDate(ticket.lastActivityAt)}
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{ticket.assignee ?? "Unassigned"}</TableCell>
                  <TableCell className="text-sm text-muted">
                    {formatDate(ticket.updated)}
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
        </Table>
      </div>
    </div>
  );
}
