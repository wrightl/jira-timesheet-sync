"use client";

import { useEffect, useState, useTransition } from "react";
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

type SupportTicket = {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  assigneeEmail: string | null;
  created: string | null;
  updated: string | null;
  priority: string | null;
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

function getPriorityBadgeVariant(
  priority: string | null,
): "ok" | "warning" | "danger" | "accent" | "muted" {
  if (!priority) return "muted";
  const lower = priority.toLowerCase();
  if (lower.includes("critical") || lower.includes("highest")) return "danger";
  if (lower.includes("high")) return "warning";
  if (lower.includes("low") || lower.includes("lowest")) return "ok";
  return "muted";
}

export function SupportTicketsContent() {
  const [data, setData] = useState<TicketsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const { tickets, metrics } = data;
  const sortedAssignees = Object.entries(metrics.ticketsByAssignee).sort(
    (a, b) => b[1] - a[1],
  );

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

        <Card>
          <CardTitle className="mb-2 text-sm text-muted">
            Avg Response Time
          </CardTitle>
          <p className="text-3xl font-bold">
            {metrics.averageResponseTimeHours !== null
              ? formatHours(metrics.averageResponseTimeHours)
              : "—"}
          </p>
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
        <h2 className="mb-4 text-lg font-semibold">All Tickets</h2>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Key</TableHeaderCell>
              <TableHeaderCell>Summary</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Priority</TableHeaderCell>
              <TableHeaderCell>Assignee</TableHeaderCell>
              <TableHeaderCell>Updated</TableHeaderCell>
            </TableRow>
          </TableHead>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.key}>
                  <TableCell className="font-mono text-sm">
                    {ticket.key}
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
                    {ticket.priority ? (
                      <Badge variant={getPriorityBadgeVariant(ticket.priority)}>
                        {ticket.priority}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{ticket.assignee ?? "Unassigned"}</TableCell>
                  <TableCell className="text-sm text-muted">
                    {formatDate(ticket.updated)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
        </Table>
      </div>
    </div>
  );
}
