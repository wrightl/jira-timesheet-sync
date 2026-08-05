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

type UserMapping = {
  id: string;
  jiraDisplayName: string;
  jiraAccountId: string | null;
  bitmapUserId: string;
  bitmapEmail: string | null;
  jobTitle: string | null;
  enabled: boolean;
};

const emptyForm = {
  jiraDisplayName: "",
  jiraAccountId: "",
  bitmapUserId: "",
  bitmapEmail: "",
  jobTitle: "",
  enabled: true,
};

export function UserMappingsManager({ authed }: { authed: boolean }) {
  const [mappings, setMappings] = useState<UserMapping[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/user-mappings");
      if (!res.ok) {
        setError(
          res.status === 401 ? "Sign in required" : "Failed to load user mappings",
        );
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
      <p className="text-sm text-muted">
        Sign in to manage Jira ↔ Bitmap user mappings.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setError(null);
              const res = await fetch("/api/user-mappings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jiraDisplayName: form.jiraDisplayName,
                  jiraAccountId: form.jiraAccountId || null,
                  bitmapUserId: form.bitmapUserId,
                  bitmapEmail: form.bitmapEmail || null,
                  jobTitle: form.jobTitle || null,
                  enabled: form.enabled,
                }),
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
          <CardTitle className="mb-3">Add user mapping</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Jira display name" htmlFor="um-display">
              <Input
                id="um-display"
                value={form.jiraDisplayName}
                onChange={(e) =>
                  setForm({ ...form, jiraDisplayName: e.target.value })
                }
                placeholder="Ada Lovelace"
                required
              />
            </Field>
            <Field label="Bitmap user ID" htmlFor="um-bitmap-id">
              <Input
                id="um-bitmap-id"
                value={form.bitmapUserId}
                onChange={(e) =>
                  setForm({ ...form, bitmapUserId: e.target.value })
                }
                required
              />
            </Field>
            <Field label="Jira account ID" htmlFor="um-jira-id">
              <Input
                id="um-jira-id"
                value={form.jiraAccountId}
                onChange={(e) =>
                  setForm({ ...form, jiraAccountId: e.target.value })
                }
              />
            </Field>
            <Field label="Bitmap email" htmlFor="um-email">
              <Input
                id="um-email"
                value={form.bitmapEmail}
                onChange={(e) =>
                  setForm({ ...form, bitmapEmail: e.target.value })
                }
              />
            </Field>
            <Field
              label="Job title"
              htmlFor="um-job"
              className="mb-3 sm:col-span-2"
            >
              <Input
                id="um-job"
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                placeholder="Software Engineer / QA Engineer"
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
              {pending ? "Saving…" : "Add user mapping"}
            </Button>
          </div>
          {error ? (
            <Alert variant="error" className="mt-3">
              {error}
            </Alert>
          ) : null}
        </form>
      </Card>

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Display name</TableHeaderCell>
            <TableHeaderCell>Bitmap user</TableHeaderCell>
            <TableHeaderCell>Job title</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell />
          </tr>
        </TableHead>
        <TableBody>
          {mappings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted">
                No user mappings yet. Matches are created automatically on first
                sync when display names match.
              </TableCell>
            </TableRow>
          ) : (
            mappings.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="font-medium">{m.jiraDisplayName}</div>
                  {m.bitmapEmail ? (
                    <div className="text-xs text-muted">{m.bitmapEmail}</div>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {m.bitmapUserId}
                </TableCell>
                <TableCell>{m.jobTitle ?? "—"}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await fetch(`/api/user-mappings?id=${m.id}`, {
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
                        await fetch(`/api/user-mappings?id=${m.id}`, {
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
