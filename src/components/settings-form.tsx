"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SettingsState = {
  hasToken: boolean;
  tokenSource: string;
  maskedToken: string | null;
  internalPmBaseUrl: string | null;
};

export function SettingsForm({ authed }: { authed: boolean }) {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/settings");
      if (!res.ok) {
        setError(
          res.status === 401 ? "Sign in required" : "Failed to load settings",
        );
        setSettings(null);
        return;
      }
      setSettings(await res.json());
    });
  };

  useEffect(() => {
    if (authed) load();
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to manage the access token.</p>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle className="mb-2">Internal PM access token</CardTitle>
        <CardDescription className="mb-4">
          Token is encrypted at rest. After saving, only a masked value is shown.
          You can also seed via{" "}
          <code className="font-mono text-xs">INTERNAL_PM_ACCESS_TOKEN</code> in{" "}
          <code className="font-mono text-xs">.env.local</code>.
        </CardDescription>
        {settings ? (
          <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Status</dt>
              <dd>{settings.hasToken ? "Configured" : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-muted">Source</dt>
              <dd>{settings.tokenSource}</dd>
            </div>
            <div>
              <dt className="text-muted">Masked token</dt>
              <dd className="font-mono text-xs">
                {settings.maskedToken ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">PM base URL</dt>
              <dd className="font-mono text-xs">
                {settings.internalPmBaseUrl ?? "—"}
              </dd>
            </div>
          </dl>
        ) : null}

        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setMessage(null);
              setError(null);
              const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ internalPmAccessToken: token }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error ?? "Save failed");
                return;
              }
              setToken("");
              setMessage("Token saved");
              load();
            });
          }}
        >
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste access token"
            className="flex-1"
            required
          />
          <Button type="submit" disabled={pending} className="shrink-0">
            {pending ? "Saving…" : "Save token"}
          </Button>
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

      <Card>
        <CardTitle className="mb-2">Required environment</CardTitle>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted">
          <li>
            <code className="font-mono text-xs text-foreground">
              DATABASE_URL
            </code>{" "}
            — Neon pooled connection
          </li>
          <li>
            <code className="font-mono text-xs text-foreground">
              JIRA_WEBHOOK_SECRET
            </code>{" "}
            — shared secret as{" "}
            <code className="font-mono text-xs">X-Webhook-Token</code> header
          </li>
          <li>
            <code className="font-mono text-xs text-foreground">
              SETTINGS_ENCRYPTION_KEY
            </code>{" "}
            — encrypts tokens stored via this UI
          </li>
          <li>
            <code className="font-mono text-xs text-foreground">
              ADMIN_EMAIL
            </code>{" "}
            /{" "}
            <code className="font-mono text-xs text-foreground">
              ADMIN_PASSWORD
            </code>{" "}
            — seed admin via{" "}
            <code className="font-mono text-xs">npm run db:seed</code>
          </li>
          <li>
            <code className="font-mono text-xs text-foreground">
              ALLOW_PUBLIC_REGISTER
            </code>{" "}
            — set to{" "}
            <code className="font-mono text-xs">true</code> to allow
            self-registration (otherwise admins create users)
          </li>
        </ul>
      </Card>
    </div>
  );
}
