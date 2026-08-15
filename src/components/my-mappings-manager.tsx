"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";

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
  }, [authed]);

  useEffect(() => {
    if (!selectedSpace) return;
    const clientId = selectedSpace.clientId;
    startTransition(async () => {
      setError(null);
      const res = await fetch(
        `/api/bitmap/projects?clientId=${encodeURIComponent(clientId)}`,
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
    });
  }, [selectedSpace]);

  useEffect(() => {
    if (!projectId) return;
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
      <Card>
        <form
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
              setProjects([]);
              setBudgets([]);
              load();
            });
          }}
        >
          <CardTitle className="mb-3">Add user-specific mapping</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Jira space"
              htmlFor="my-space"
              className="mb-3 sm:col-span-2"
            >
              <Select
                id="my-space"
                value={spaceKey}
                onChange={(e) => {
                  setSpaceKey(e.target.value);
                  setProjects([]);
                  setBudgets([]);
                  setProjectId("");
                  setProjectBudgetId("");
                }}
                required
              >
                <option value="">Select a space…</option>
                {spaceMappings.map((s) => (
                  <option key={s.id} value={s.jiraSpaceKey}>
                    {s.jiraSpaceKey} ({s.clientId})
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Project"
              htmlFor="my-project"
              className="mb-3 sm:col-span-2"
            >
              <Select
                id="my-project"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setBudgets([]);
                  setProjectBudgetId("");
                }}
                required
                disabled={!selectedSpace || projects.length === 0}
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.id}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Project budget"
              htmlFor="my-budget"
              className="mb-3 sm:col-span-2"
            >
              <Select
                id="my-budget"
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
              </Select>
            </Field>
          </div>
          <div className="mt-1 flex justify-end">
            <Button
              type="submit"
              disabled={
                pending || !selectedSpace || !projectId || !projectBudgetId
              }
            >
              {pending ? "Saving…" : "Save mapping"}
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
            <TableHeaderCell>Space</TableHeaderCell>
            <TableHeaderCell>Project</TableHeaderCell>
            <TableHeaderCell>Budget</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell />
          </tr>
        </TableHead>
        <TableBody>
          {mappings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-muted">
                No user-specific mappings yet. Without one, sync auto-picks
                project and budget.
              </TableCell>
            </TableRow>
          ) : (
            mappings.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.jiraSpaceKey}</TableCell>
                <TableCell>
                  <div>{m.projectName ?? "—"}</div>
                  <div className="font-mono text-xs text-muted">
                    {m.projectId}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{m.budgetName ?? "—"}</div>
                  <div className="font-mono text-xs text-muted">
                    {m.projectBudgetId}
                  </div>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
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
                        await fetch(`/api/user-space-mappings?id=${m.id}`, {
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
