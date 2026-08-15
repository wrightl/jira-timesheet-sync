"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { GithubTokenExpiryAlert } from "@/components/github-token-expiry-alert";
import { GithubRepoPicker } from "@/components/github-repo-picker";
import { formatGithubTokenExpiryLabel } from "@/lib/github-token-expiry";

type UserSettingsState = {
  hasToken: boolean;
  maskedToken: string | null;
  githubOrg: string | null;
  tokenExpiresAt: string | null;
  githubRepos: string[];
  configured: boolean;
  syncEnabled: boolean;
};

export function SettingsForm({ authed }: { authed: boolean }) {
  const [settings, setSettings] = useState<UserSettingsState | null>(null);
  const [token, setToken] = useState("");
  const [org, setOrg] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/user-settings");
      if (!res.ok) {
        setError(
          res.status === 401 ? "Sign in required" : "Failed to load settings",
        );
        setSettings(null);
        return;
      }
      const data = (await res.json()) as UserSettingsState;
      setSettings(data);
      setOrg(data.githubOrg ?? "");
      setSyncEnabled(Boolean(data.syncEnabled));
    });
  };

  useEffect(() => {
    if (authed) load();
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to manage your settings.</p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="mb-1">Timesheet sync</CardTitle>
            <CardDescription>
              When disabled, your Jira worklogs are skipped and not written to
              Bitmap.
            </CardDescription>
          </div>
          <Toggle
            checked={syncEnabled}
            disabled={pending || settings === null}
            label="Timesheet sync"
            onCheckedChange={(next) => {
              startTransition(async () => {
                setMessage(null);
                setError(null);
                const res = await fetch("/api/user-settings", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ syncEnabled: next }),
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  setError(
                    (data as { error?: string }).error ??
                      "Failed to update sync preference",
                  );
                  return;
                }
                const data = (await res.json()) as UserSettingsState;
                setSyncEnabled(Boolean(data.syncEnabled));
                setSettings((prev) => (prev ? { ...prev, ...data } : data));
                setMessage("Sync preference saved");
              });
            }}
          />
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-2">GitHub connection</CardTitle>
        <CardDescription className="mb-4">
          Personal access token is encrypted at rest and never shared with other
          users. Use a classic or fine-grained PAT with{" "}
          <code className="font-mono text-xs">repo</code> (or org read) scope so
          private organisation repositories are visible. Leave the token blank to
          keep the current value.
        </CardDescription>
        {settings?.hasToken ? (
          <div className="mb-4">
            <GithubTokenExpiryAlert tokenExpiresAt={settings.tokenExpiresAt} />
          </div>
        ) : null}
        {settings ? (
          <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Token status</dt>
              <dd>{settings.hasToken ? "Configured" : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-muted">Masked token</dt>
              <dd className="font-mono text-xs">
                {settings.maskedToken ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Organisation</dt>
              <dd className="font-mono text-xs">
                {settings.githubOrg ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Token expiry</dt>
              <dd>
                {settings.hasToken
                  ? formatGithubTokenExpiryLabel(settings.tokenExpiresAt)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Dashboard ready</dt>
              <dd>{settings.configured ? "Yes" : "No"}</dd>
            </div>
          </dl>
        ) : null}

        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setMessage(null);
              setError(null);
              const res = await fetch("/api/user-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  githubOrg: org,
                  githubToken: token || undefined,
                }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(
                  (data as { error?: string }).error ?? "Save failed",
                );
                return;
              }
              setToken("");
              setMessage("GitHub settings saved");
              load();
            });
          }}
        >
          <Input
            type="text"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="Organisation login (e.g. acme-corp)"
            required
            autoComplete="off"
          />
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste GitHub personal access token"
            autoComplete="off"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save GitHub settings"}
            </Button>
            <Link
              href="/github"
              className="text-sm text-accent underline-offset-2 hover:underline"
            >
              Open GitHub dashboard
            </Link>
          </div>
        </form>
      </Card>

      <GithubRepoPicker
        enabled={Boolean(settings?.configured)}
        selected={settings?.githubRepos ?? []}
        onSaved={(repos) => {
          setSettings((prev) => (prev ? { ...prev, githubRepos: repos } : prev));
          setMessage(
            repos.length === 0
              ? "Using all organisation repositories"
              : "Repository filter saved",
          );
        }}
        onError={(message) => {
          setError(message);
          if (message) setMessage(null);
        }}
      />

      {message ? (
        <Alert variant="success">{message}</Alert>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
