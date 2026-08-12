"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type GithubSettingsState = {
  hasToken: boolean;
  maskedToken: string | null;
  githubOrg: string | null;
  configured: boolean;
};

export function MySettingsForm({ authed }: { authed: boolean }) {
  const [settings, setSettings] = useState<GithubSettingsState | null>(null);
  const [token, setToken] = useState("");
  const [org, setOrg] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/me/github");
      if (!res.ok) {
        setError(
          res.status === 401 ? "Sign in required" : "Failed to load settings",
        );
        setSettings(null);
        return;
      }
      const data = (await res.json()) as GithubSettingsState;
      setSettings(data);
      setOrg(data.githubOrg ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
      setSettings(null);
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (authed) void load();
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to manage your settings.</p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle className="mb-2">GitHub connection</CardTitle>
        <CardDescription className="mb-4">
          Personal access token is encrypted at rest and never shared with other
          users. Use a classic or fine-grained PAT with{" "}
          <code className="font-mono text-xs">repo</code> (or org read) scope so
          private organization repositories are visible. Leave the token blank to
          keep the current value.
        </CardDescription>
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
              <dt className="text-muted">Organization</dt>
              <dd className="font-mono text-xs">
                {settings.githubOrg ?? "—"}
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
            void (async () => {
              setPending(true);
              setMessage(null);
              setError(null);
              try {
                const res = await fetch("/api/me/github", {
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
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Save failed");
              } finally {
                setPending(false);
              }
            })();
          }}
        >
          <Input
            type="text"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="Organization login (e.g. acme-corp)"
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
        {message ? (
          <Alert variant="success" className="mt-3">
            {message}
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="error" className="mt-3">
            {error}
          </Alert>
        ) : null}
      </Card>
    </div>
  );
}
