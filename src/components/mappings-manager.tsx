"use client";

import { useEffect, useState, useTransition } from "react";

type Mapping = {
  id: string;
  jiraSpaceId: string;
  jiraSpaceKey: string;
  internalProjectId: string;
  enabled: boolean;
};

const emptyForm = {
  jiraSpaceId: "",
  jiraSpaceKey: "",
  internalProjectId: "",
  enabled: true,
};

export function MappingsManager({ authed }: { authed: boolean }) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to manage space ↔ project mappings.</p>
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
        <h2 className="mb-3 text-base font-semibold">Add mapping</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Jira space ID</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.jiraSpaceId}
              onChange={(e) => setForm({ ...form, jiraSpaceId: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Jira space key</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.jiraSpaceKey}
              onChange={(e) => setForm({ ...form, jiraSpaceKey: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted">Internal project ID</span>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={form.internalProjectId}
              onChange={(e) =>
                setForm({ ...form, internalProjectId: e.target.value })
              }
              required
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
            {pending ? "Saving…" : "Add mapping"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Space key</th>
              <th className="px-4 py-3 font-medium">Space ID</th>
              <th className="px-4 py-3 font-medium">Project ID</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  No mappings yet. Worklogs from unmapped spaces are skipped.
                </td>
              </tr>
            ) : (
              mappings.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{m.jiraSpaceKey}</td>
                  <td className="px-4 py-3 font-mono text-xs">{m.jiraSpaceId}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {m.internalProjectId}
                  </td>
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
                          await fetch(`/api/mappings?id=${m.id}`, {
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
                          await fetch(`/api/mappings?id=${m.id}`, {
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
