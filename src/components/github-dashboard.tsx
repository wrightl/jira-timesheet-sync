"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { RefreshButton } from "@/components/ui/refresh-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type {
  GithubOrgRepoSummary,
  GithubPullSummary,
} from "@/clients/github-http";
import {
  formatPullAge,
  type GithubDashboardMetric,
  type GithubDashboardResult,
} from "@/lib/github-dashboard";

function metricBadgeVariant(
  status: GithubDashboardMetric["status"],
): "ok" | "warning" | "danger" | "muted" {
  if (status === "ok") return "ok";
  if (status === "watch") return "warning";
  if (status === "risk") return "danger";
  return "muted";
}

export function GithubDashboard({ authed }: { authed: boolean }) {
  const [data, setData] = useState<GithubDashboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/github/dashboard");
      if (!res.ok) {
        setError(
          res.status === 401 ? "Sign in required" : "Failed to load dashboard",
        );
        setData(null);
        return;
      }
      const json = (await res.json()) as GithubDashboardResult;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setData(null);
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (authed) void load();
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted">Sign in to view the GitHub dashboard.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">
          {data?.org ? (
            <>
              Organization{" "}
              <span className="font-mono text-foreground">{data.org}</span>
            </>
          ) : (
            "Connect GitHub in My settings to load org metrics."
          )}
        </div>
        <RefreshButton pending={pending} onClick={() => load()} />
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {!pending && (!data || !data.configured) ? (
        <Alert>
          GitHub is not configured for your account.{" "}
          <Link
            href="/my-settings"
            className="underline underline-offset-2"
          >
            Add a token and organization
          </Link>
          .
        </Alert>
      ) : null}

      {data?.error ? <Alert variant="error">{data.error}</Alert> : null}

      {data?.configured && data.metrics.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.metrics.map((metric) => (
            <Card key={metric.key}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-medium text-muted">
                  {metric.label}
                </CardTitle>
                <Badge variant={metricBadgeVariant(metric.status)}>
                  {metric.status}
                </Badge>
              </div>
              <p className="text-3xl font-semibold tracking-tight">
                {metric.value ?? "—"}
              </p>
              {metric.hint ? (
                <CardDescription className="mt-2">{metric.hint}</CardDescription>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      {data?.configured && data.authorWip.length > 0 ? (
        <Card>
          <CardTitle className="mb-1">Open PR WIP by author</CardTitle>
          <CardDescription className="mb-4">
            Authors with the most open pull requests in the recent sample.
          </CardDescription>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Author</TableHeaderCell>
                <TableHeaderCell>Open PRs</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.authorWip.map((row) => (
                <TableRow key={row.login}>
                  <TableCell className="font-mono text-xs">{row.login}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.openCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {data?.configured ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <CardTitle className="mb-1">Recently updated pull requests</CardTitle>
              <CardDescription>
                Open PRs across the organization, sorted by last update.
              </CardDescription>
            </div>
          </div>
          <PullRequestsTable pulls={data.recentPullRequests} />
        </Card>
      ) : null}

      {data?.configured && data.recentRepos.length > 0 ? (
        <Card>
          <CardTitle className="mb-1">Recently updated repositories</CardTitle>
          <CardDescription className="mb-4">
            Latest activity across org repositories.
          </CardDescription>
          <ReposTable repos={data.recentRepos} />
        </Card>
      ) : null}
    </div>
  );
}

function PullRequestsTable({ pulls }: { pulls: GithubPullSummary[] }) {
  if (pulls.length === 0) {
    return (
      <p className="text-sm text-muted">No open pull requests found.</p>
    );
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Pull request</TableHeaderCell>
          <TableHeaderCell>Author</TableHeaderCell>
          <TableHeaderCell>State</TableHeaderCell>
          <TableHeaderCell>Review</TableHeaderCell>
          <TableHeaderCell>Age</TableHeaderCell>
          <TableHeaderCell>Open comments</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {pulls.map((pull) => (
          <TableRow key={pull.id}>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <a
                  href={pull.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-accent underline-offset-2 hover:underline"
                >
                  {pull.repository}#{pull.number}
                </a>
                <span className="text-muted">{pull.title}</span>
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {pull.authorLogin ?? "—"}
            </TableCell>
            <TableCell>
              <Badge variant={pull.state === "draft" ? "muted" : "accent"}>
                {pull.state === "draft" ? "Draft" : "Published"}
              </Badge>
            </TableCell>
            <TableCell>
              {pull.needsReview ? (
                <Badge variant="warning">Needs review</Badge>
              ) : (
                <Badge variant="ok">Reviewed</Badge>
              )}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {formatPullAge(pull.createdAt)}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {pull.openCommentCount}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReposTable({ repos }: { repos: GithubOrgRepoSummary[] }) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Repository</TableHeaderCell>
          <TableHeaderCell>Updated</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {repos.map((repo) => (
          <TableRow key={repo.nameWithOwner}>
            <TableCell>
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {repo.nameWithOwner}
              </a>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {formatPullAge(repo.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
