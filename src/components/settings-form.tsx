"use client";

import { useEffect, useState, useTransition } from "react";

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
        setError(res.status === 401 ? "Sign in required" : "Failed to load settings");
        setSettings(null);
        return;
      }
      setSettings(await res.json());
    });
  };

  useEffect(() => {
    if (authed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to manage the access token.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-base font-semibold">Internal PM access token</h2>
        <p className="mb-4 text-sm text-muted">
          Token is encrypted at rest. After saving, only a masked value is shown.
          You can also seed via <code className="font-mono text-xs">INTERNAL_PM_ACCESS_TOKEN</code> in{" "}
          <code className="font-mono text-xs">.env.local</code>.
        </p>
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
              <dd className="font-mono text-xs">{settings.maskedToken ?? "—"}</dd>
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
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste access token"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2"
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save token"}
          </button>
        </form>
        {message ? <p className="mt-2 text-sm text-ok">{message}</p> : null}
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <h2 className="mb-2 text-base font-semibold">Required environment</h2>
        <ul className="list-inside list-disc space-y-1 text-muted">
          <li>
            <code className="font-mono text-xs text-foreground">DATABASE_URL</code>{" "}
            — Neon pooled connection
          </li>
          <li>
            <code className="font-mono text-xs text-foreground">JIRA_WEBHOOK_SECRET</code>{" "}
            — shared secret as <code className="font-mono text-xs">X-Webhook-Token</code> header
          </li>
          <li>
            <code className="font-mono text-xs text-foreground">SETTINGS_ENCRYPTION_KEY</code>{" "}
            — encrypts tokens stored via this UI
          </li>
          <li>
            <code className="font-mono text-xs text-foreground">ADMIN_API_KEY</code>{" "}
            — protects admin APIs and this UI
          </li>
        </ul>
      </div>
    </div>
  );
}
