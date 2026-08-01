"use client";

import { useEffect, useState, useTransition } from "react";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <form
        className="rounded-lg border border-border bg-card p-4"
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
        <h3 className="mb-3 text-base font-semibold">Add user mapping</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Jira display name</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.jiraDisplayName}
              onChange={(e) =>
                setForm({ ...form, jiraDisplayName: e.target.value })
              }
              placeholder="Ada Lovelace"
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Bitmap user ID</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.bitmapUserId}
              onChange={(e) =>
                setForm({ ...form, bitmapUserId: e.target.value })
              }
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Jira account ID</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.jiraAccountId}
              onChange={(e) =>
                setForm({ ...form, jiraAccountId: e.target.value })
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Bitmap email</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.bitmapEmail}
              onChange={(e) =>
                setForm({ ...form, bitmapEmail: e.target.value })
              }
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Job title</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.jobTitle}
              onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
              placeholder="Software Engineer / QA Engineer"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add user mapping"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Display name</th>
              <th className="px-4 py-3 font-medium">Bitmap user</th>
              <th className="px-4 py-3 font-medium">Job title</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  No user mappings yet. Matches are created automatically on
                  first sync when display names match.
                </td>
              </tr>
            ) : (
              mappings.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{m.jiraDisplayName}</div>
                    {m.bitmapEmail ? (
                      <div className="text-xs text-muted">{m.bitmapEmail}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{m.bitmapUserId}</td>
                  <td className="px-4 py-3">{m.jobTitle ?? "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className={`rounded-full px-2.5 py-0.5 text-xs ${
                        m.enabled
                          ? "bg-ok/10 text-ok"
                          : "bg-warning/10 text-warning"
                      }`}
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
                      {m.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-danger hover:underline"
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
