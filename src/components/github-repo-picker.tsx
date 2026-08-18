"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { GithubOrgRepoSummary } from "@/clients/github-http";

type GithubReposResponse = {
  repos?: GithubOrgRepoSummary[];
  error?: string;
};

export function GithubRepoPicker({
  enabled,
  selected,
  onSaved,
  onError,
}: {
  enabled: boolean;
  selected: string[];
  onSaved: (repos: string[]) => void;
  onError: (message: string | null) => void;
}) {
  const [repos, setRepos] = useState<GithubOrgRepoSummary[]>([]);
  const [draft, setDraft] = useState<string[]>(selected);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(selected);
  }, [selected]);

  useEffect(() => {
    if (!enabled) {
      setRepos([]);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      setLoadError(null);
      const res = await fetch("/api/github/repos");
      const data = (await res.json().catch(() => ({}))) as GithubReposResponse;
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(data.error ?? "Failed to load repositories");
        setRepos([]);
        return;
      }
      setRepos(Array.isArray(data.repos) ? data.repos : []);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((repo) =>
      repo.nameWithOwner.toLowerCase().includes(q),
    );
  }, [repos, query]);

  const selectedSet = useMemo(() => new Set(draft.map((n) => n.toLowerCase())), [draft]);
  const countLabel =
    draft.length === 0
      ? "All repositories"
      : `${draft.length} of ${repos.length || "…"} selected`;

  if (!enabled) {
    return (
      <Card>
        <CardTitle className="mb-2">Repositories</CardTitle>
        <CardDescription>
          Save a GitHub organisation and token first, then choose which
          repositories appear on the GitHub dashboard. Leave none selected to
          include the whole organisation.
        </CardDescription>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle className="mb-2">Repositories</CardTitle>
      <CardDescription className="mb-4">
        Choose which organisation repositories to include on the GitHub
        dashboard. An empty selection uses all repositories.
      </CardDescription>
      <p className="mb-3 text-sm text-muted">{countLabel}</p>
      {loadError ? (
        <p className="mb-3 text-sm text-danger">{loadError}</p>
      ) : null}
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter repositories"
        className="mb-3"
        disabled={pending}
      />
      <div className="mb-4 max-h-64 overflow-y-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted">
            {pending ? "Loading…" : "No repositories match."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((repo) => {
              const checked = selectedSet.has(repo.nameWithOwner.toLowerCase());
              return (
                <li key={repo.nameWithOwner}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setDraft((current) => {
                          if (checked) {
                            return current.filter(
                              (name) =>
                                name.toLowerCase() !==
                                repo.nameWithOwner.toLowerCase(),
                            );
                          }
                          return [...current, repo.nameWithOwner];
                        });
                      }}
                    />
                    <span className="font-mono text-xs">{repo.nameWithOwner}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              onError(null);
              const res = await fetch("/api/user-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ githubRepos: draft }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                onError(
                  (data as { error?: string }).error ??
                    "Failed to save repositories",
                );
                return;
              }
              onSaved(draft);
            });
          }}
        >
          {pending ? "Saving…" : "Save repositories"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || draft.length === 0}
          onClick={() => {
            setDraft([]);
            startTransition(async () => {
              onError(null);
              const res = await fetch("/api/user-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ githubRepos: [] }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                onError(
                  (data as { error?: string }).error ??
                    "Failed to save repositories",
                );
                return;
              }
              onSaved([]);
            });
          }}
        >
          Use all repositories
        </Button>
      </div>
    </Card>
  );
}
