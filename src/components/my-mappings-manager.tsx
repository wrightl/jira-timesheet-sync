"use client";

import { useEffect, useState, useTransition } from "react";

type SpaceMapping = {
  id: string;
  jiraSpaceKey: string;
  clientId: string;
  enabled: boolean;
};

type UserSpaceMapping = {
  id: string;
  jiraSpaceKey: string;
  clientId: string;
  projectId: string;
  projectBudgetId: string;
  projectName: string | null;
  budgetName: string | null;
  enabled: boolean;
};

type ProjectOption = {
  id: string;
  name?: string | null;
  state?: string | null;
  started?: boolean | null;
};

type BudgetOption = {
  id: string;
  name: string;
  billable_time_remaining?: number | null;
};

export function MyMappingsManager({ authed }: { authed: boolean }) {
  const [spaceMappings, setSpaceMappings] = useState<SpaceMapping[]>([]);
  const [mappings, setMappings] = useState<UserSpaceMapping[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [spaceKey, setSpaceKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectBudgetId, setProjectBudgetId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedSpace = spaceMappings.find((s) => s.jiraSpaceKey === spaceKey);
  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedBudget = budgets.find((b) => b.id === projectBudgetId);

  const load = () => {
    startTransition(async () => {
      setError(null);
      const [spacesRes, mineRes] = await Promise.all([
        fetch("/api/mappings"),
        fetch("/api/user-space-mappings"),
      ]);
      if (!spacesRes.ok || !mineRes.ok) {
        setError(
          spacesRes.status === 401 || mineRes.status === 401
            ? "Sign in required"
            : "Failed to load mappings",
        );
        return;
      }
      const spacesData = await spacesRes.json();
      const mineData = await mineRes.json();
      setSpaceMappings(
        (spacesData.mappings ?? []).filter((m: SpaceMapping) => m.enabled),
      );
      setMappings(mineData.mappings ?? []);
    });
  };

  useEffect(() => {
    if (authed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  useEffect(() => {
    if (!selectedSpace) {
      setProjects([]);
      setBudgets([]);
      setProjectId("");
      setProjectBudgetId("");
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await fetch(
        `/api/bitmap/projects?clientId=${encodeURIComponent(selectedSpace.clientId)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to load projects");
        setProjects([]);
        return;
      }
      const data = await res.json();
      const list = (data.projects ?? []) as ProjectOption[];
      setProjects(
        list.filter((p) => p.state === "active" && p.started === true),
      );
      setProjectId("");
      setProjectBudgetId("");
      setBudgets([]);
    });
  }, [selectedSpace?.clientId, selectedSpace]);

  useEffect(() => {
    if (!projectId) {
      setBudgets([]);
      setProjectBudgetId("");
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await fetch(
        `/api/bitmap/budgets?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to load budgets");
        setBudgets([]);
        return;
      }
      const data = await res.json();
      setBudgets(data.budgets ?? []);
      setProjectBudgetId("");
    });
  }, [projectId]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">
        Sign in to manage your project and budget mappings.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <form
        className="rounded-lg border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!selectedSpace || !selectedProject || !selectedBudget) return;
          startTransition(async () => {
            setError(null);
            const res = await fetch("/api/user-space-mappings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jiraSpaceKey: selectedSpace.jiraSpaceKey,
                clientId: selectedSpace.clientId,
                projectId: selectedProject.id,
                projectBudgetId: selectedBudget.id,
                projectName: selectedProject.name ?? null,
                budgetName: selectedBudget.name,
                enabled: true,
              }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              setError(data.error ?? "Create failed");
              return;
            }
            setSpaceKey("");
            setProjectId("");
            setProjectBudgetId("");
            load();
          });
        }}
      >
        <h3 className="mb-3 text-base font-semibold">Add user-specific mapping</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Jira space</span>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={spaceKey}
              onChange={(e) => setSpaceKey(e.target.value)}
              required
            >
              <option value="">Select a space…</option>
              {spaceMappings.map((s) => (
                <option key={s.id} value={s.jiraSpaceKey}>
                  {s.jiraSpaceKey} ({s.clientId})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Project</span>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              disabled={!selectedSpace || projects.length === 0}
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-muted">Project budget</span>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={projectBudgetId}
              onChange={(e) => setProjectBudgetId(e.target.value)}
              required
              disabled={!projectId || budgets.length === 0}
            >
              <option value="">Select a budget…</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {typeof b.billable_time_remaining === "number"
                    ? ` (${b.billable_time_remaining} remaining)`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={pending || !selectedSpace || !projectId || !projectBudgetId}
            className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save mapping"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Space</th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  No user-specific mappings yet. Without one, sync auto-picks
                  project and budget.
                </td>
              </tr>
            ) : (
              mappings.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{m.jiraSpaceKey}</td>
                  <td className="px-4 py-3">
                    <div>{m.projectName ?? "—"}</div>
                    <div className="font-mono text-xs text-muted">{m.projectId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{m.budgetName ?? "—"}</div>
                    <div className="font-mono text-xs text-muted">
                      {m.projectBudgetId}
                    </div>
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
                          await fetch(`/api/user-space-mappings?id=${m.id}`, {
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
                          await fetch(`/api/user-space-mappings?id=${m.id}`, {
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
