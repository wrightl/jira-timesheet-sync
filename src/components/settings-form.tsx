"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AlertConfig = {
  hasSlackWebhook: boolean;
  maskedSlackWebhook: string | null;
  alertEmail: string | null;
  thresholds: {
    budgetBurnPctRisk: number;
    runwayDaysRisk: number;
    agingWipRisk: number;
    openBugsRisk: number;
    syncFailedOpenRisk: number;
    estimateCoveragePctWatch: number;
    scheduleSlipDaysRisk: number;
  };
};

type SettingsState = {
  hasToken: boolean;
  tokenSource: string;
  maskedToken: string | null;
  internalPmBaseUrl: string | null;
  hasJiraToken: boolean;
  jiraTokenSource: string;
  maskedJiraToken: string | null;
  jiraBaseUrl: string | null;
  jiraEmail: string | null;
  alerts?: AlertConfig;
};

export function SettingsForm({ authed }: { authed: boolean }) {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [token, setToken] = useState("");
  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [alertEmail, setAlertEmail] = useState("");
  const [burnRisk, setBurnRisk] = useState("90");
  const [runwayRisk, setRunwayRisk] = useState("5");
  const [syncFailRisk, setSyncFailRisk] = useState("5");
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
      const data = (await res.json()) as SettingsState;
      setSettings(data);
      setJiraBaseUrl(data.jiraBaseUrl ?? "");
      setJiraEmail(data.jiraEmail ?? "");
      setAlertEmail(data.alerts?.alertEmail ?? "");
      if (data.alerts?.thresholds) {
        setBurnRisk(String(data.alerts.thresholds.budgetBurnPctRisk));
        setRunwayRisk(String(data.alerts.thresholds.runwayDaysRisk));
        setSyncFailRisk(String(data.alerts.thresholds.syncFailedOpenRisk));
      }
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
              setMessage("Bitmap token saved");
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
        <CardTitle className="mb-2">Jira Cloud API</CardTitle>
        <CardDescription className="mb-4">
          Used for project progress metrics (estimates, coverage, bugs). API
          token is encrypted at rest. Leave the token blank to keep the current
          value. Bootstrap via{" "}
          <code className="font-mono text-xs">JIRA_BASE_URL</code>,{" "}
          <code className="font-mono text-xs">JIRA_EMAIL</code>,{" "}
          <code className="font-mono text-xs">JIRA_API_TOKEN</code>.
        </CardDescription>
        {settings ? (
          <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Token status</dt>
              <dd>{settings.hasJiraToken ? "Configured" : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-muted">Token source</dt>
              <dd>{settings.jiraTokenSource}</dd>
            </div>
            <div>
              <dt className="text-muted">Masked token</dt>
              <dd className="font-mono text-xs">
                {settings.maskedJiraToken ?? "—"}
              </dd>
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
              const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jiraBaseUrl,
                  jiraEmail,
                  jiraApiToken: jiraApiToken || undefined,
                }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error ?? "Save failed");
                return;
              }
              setJiraApiToken("");
              setMessage("Jira credentials saved");
              load();
            });
          }}
        >
          <Input
            type="url"
            value={jiraBaseUrl}
            onChange={(e) => setJiraBaseUrl(e.target.value)}
            placeholder="https://your-site.atlassian.net"
            required
          />
          <Input
            type="email"
            value={jiraEmail}
            onChange={(e) => setJiraEmail(e.target.value)}
            placeholder="Atlassian account email"
            required
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="password"
              value={jiraApiToken}
              onChange={(e) => setJiraApiToken(e.target.value)}
              placeholder={
                settings?.hasJiraToken
                  ? "Leave blank to keep current token"
                  : "Paste Jira API token"
              }
              className="flex-1"
              required={!settings?.hasJiraToken}
            />
            <Button type="submit" disabled={pending} className="shrink-0">
              {pending ? "Saving…" : "Save Jira"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardTitle className="mb-2">Slack alerts</CardTitle>
        <CardDescription className="mb-4">
          Incoming webhook for risk exceptions and weekly digests. Cron hits{" "}
          <code className="font-mono text-xs">GET /api/alerts/run</code> with{" "}
          <code className="font-mono text-xs">Authorization: Bearer CRON_SECRET</code>
          . Use <code className="font-mono text-xs">?weekly=1</code> for the
          weekly digest and <code className="font-mono text-xs">?dryRun=1</code>{" "}
          to preview without posting.
        </CardDescription>
        {settings?.alerts ? (
          <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Webhook</dt>
              <dd>
                {settings.alerts.hasSlackWebhook
                  ? settings.alerts.maskedSlackWebhook
                  : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Alert email (stored)</dt>
              <dd>{settings.alerts.alertEmail ?? "—"}</dd>
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
              const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  slackWebhookUrl: slackWebhookUrl || undefined,
                  alertEmail: alertEmail || null,
                  alertThresholds: {
                    budgetBurnPctRisk: Number(burnRisk),
                    runwayDaysRisk: Number(runwayRisk),
                    syncFailedOpenRisk: Number(syncFailRisk),
                  },
                }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error ?? "Save failed");
                return;
              }
              setSlackWebhookUrl("");
              setMessage("Alert settings saved");
              load();
            });
          }}
        >
          <Input
            type="url"
            value={slackWebhookUrl}
            onChange={(e) => setSlackWebhookUrl(e.target.value)}
            placeholder={
              settings?.alerts?.hasSlackWebhook
                ? "Leave blank to keep current Slack webhook"
                : "https://hooks.slack.com/services/..."
            }
          />
          <Input
            type="email"
            value={alertEmail}
            onChange={(e) => setAlertEmail(e.target.value)}
            placeholder="Ops email (stored for future delivery)"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              value={burnRisk}
              onChange={(e) => setBurnRisk(e.target.value)}
              placeholder="Burn % risk"
              aria-label="Budget burn risk threshold"
            />
            <Input
              value={runwayRisk}
              onChange={(e) => setRunwayRisk(e.target.value)}
              placeholder="Runway days risk"
              aria-label="Runway days risk threshold"
            />
            <Input
              value={syncFailRisk}
              onChange={(e) => setSyncFailRisk(e.target.value)}
              placeholder="Open sync failures risk"
              aria-label="Sync failures risk threshold"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save alerts"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  setMessage(null);
                  setError(null);
                  const res = await fetch("/api/alerts/run?dryRun=1");
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setError(data.error ?? "Dry run failed");
                    return;
                  }
                  setMessage(
                    `Dry run: ${data.alerts?.length ?? 0} alerts\n${data.digestText ?? ""}`,
                  );
                });
              }}
            >
              Dry-run alerts
            </Button>
          </div>
        </form>
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
            — shared secret for{" "}
            <code className="font-mono text-xs">X-Hub-Signature</code> (Jira
            webhook secret) or{" "}
            <code className="font-mono text-xs">X-Webhook-Token</code>
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
