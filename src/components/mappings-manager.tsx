"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

type Mapping = {
  id: string;
  jiraSpaceKey: string;
  clientId: string;
  enabled: boolean;
};

const emptyForm = {
  jiraSpaceKey: "",
  clientId: "",
  enabled: true,
};

export function MappingsManager({ authed }: { authed: boolean }) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/mappings");
      if (!res.ok) {
        setError(res.status === 401 ? "Sign in required" : "Failed to load mappings");
        setMappings([]);
        return;
      }
      const data = await res.json();
      setMappings(data.mappings ?? []);
    });
  };

  useEffect(() => {
    if (authed) load();
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to manage space ↔ client mappings.</p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="mb-1">Discover from Bitmap</CardTitle>
            <p className="text-sm text-muted">
              Scan active Bitmap projects&apos;{" "}
              <code className="text-xs">jira_budget_jql</code> and create missing
              space → client mappings.
            </p>
          </div>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                setDiscoverMsg(null);
                const res = await fetch("/api/mappings/discover", {
                  method: "POST",
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setError(data.error ?? "Discover failed");
                  return;
                }
                const conflictNote =
                  Array.isArray(data.conflicts) && data.conflicts.length > 0
                    ? `, ${data.conflicts.length} conflict(s) skipped`
                    : "";
                setDiscoverMsg(
                  `Created ${data.createdCount ?? 0}, skipped existing ${data.skippedExisting ?? 0}${conflictNote}.`,
                );
                load();
              })
            }
          >
            {pending ? "Working…" : "Discover from Bitmap"}
          </Button>
        </div>
        {discoverMsg ? (
          <Alert variant="success" className="mb-0">
            {discoverMsg}
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="error" className="mt-3">
            {error}
          </Alert>
        ) : null}
      </Card>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setError(null);
              setDiscoverMsg(null);
              const res = await fetch("/api/mappings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error ?? "Create failed");
                return;
              }
              setForm(emptyForm);
              load();
            });
          }}
        >
          <CardTitle className="mb-3">Add mapping</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jira space key" htmlFor="mapping-space">
              <Input
                id="mapping-space"
                value={form.jiraSpaceKey}
                onChange={(e) =>
                  setForm({ ...form, jiraSpaceKey: e.target.value })
                }
                placeholder="ENG"
                required
              />
            </Field>
            <Field label="Client ID" htmlFor="mapping-client">
              <Input
                id="mapping-client"
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              Enabled
            </label>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add mapping"}
            </Button>
          </div>
          {error && !discoverMsg ? (
            <Alert variant="error" className="mt-3">
              {error}
            </Alert>
          ) : null}
        </form>
      </Card>

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Space key</TableHeaderCell>
            <TableHeaderCell>Client ID</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell />
          </tr>
        </TableHead>
        <TableBody>
          {mappings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-muted">
                No mappings yet. Worklogs from unmapped spaces are skipped.
              </TableCell>
            </TableRow>
          ) : (
            mappings.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.jiraSpaceKey}</TableCell>
                <TableCell className="font-mono text-xs">{m.clientId}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await fetch(`/api/mappings?id=${m.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ enabled: !m.enabled }),
                        });
                        load();
                      })
                    }
                  >
                    <Badge variant={m.enabled ? "ok" : "warning"}>
                      {m.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    className="text-sm text-danger hover:underline"
                    onClick={() =>
                      startTransition(async () => {
                        await fetch(`/api/mappings?id=${m.id}`, {
                          method: "DELETE",
                        });
                        load();
                      })
                    }
                  >
                    Delete
                  </button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
