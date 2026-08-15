"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
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
import { GithubTokenExpiryAlert } from "@/components/github-token-expiry-alert";
import { MetricHelp } from "@/components/metric-help";
import {
  EMPTY_GITHUB_DASHBOARD_FILTERS,
  GITHUB_TABLE_PAGE_SIZE,
  authorWipFromPulls,
  filterGithubPulls,
  filterGithubRepos,
  formatPullAge,
  githubDashboardFiltersActive,
  paginateItems,
  uniqueSortedLabels,
  type GithubDashboardFilters,
  type GithubDashboardMetric,
  type GithubDashboardResult,
  type GithubPullStateFilter,
  type GithubReviewFilter,
} from "@/lib/github-dashboard";

function metricBadgeVariant(
  status: GithubDashboardMetric["status"],
): "ok" | "warning" | "danger" | "muted" {
  if (status === "ok") return "ok";
  if (status === "watch") return "warning";
  if (status === "risk") return "danger";
  return "muted";
}

function repoNameWithoutOwner(nameWithOwner: string) {
  const slash = nameWithOwner.indexOf("/");
  return slash === -1 ? nameWithOwner : nameWithOwner.slice(slash + 1);
}

export function GithubDashboard({ authed }: { authed: boolean }) {
  const [data, setData] = useState<GithubDashboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [filters, setFilters] = useState<GithubDashboardFilters>(
    EMPTY_GITHUB_DASHBOARD_FILTERS,
  );

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

  const repositoryOptions = useMemo(() => {
    if (!data) return [];
    return uniqueSortedLabels([
      ...data.githubRepos,
      ...data.recentPullRequests.map((pull) => pull.repository),
      ...data.recentRepos.map((repo) => repo.nameWithOwner),
    ]);
  }, [data]);

  const authorOptions = useMemo(() => {
    if (!data) return [];
    return uniqueSortedLabels(
      data.recentPullRequests.map((pull) => pull.authorLogin),
    );
  }, [data]);

  const filteredPulls = useMemo(
    () => filterGithubPulls(data?.recentPullRequests ?? [], filters),
    [data, filters],
  );
  const filteredRepos = useMemo(
    () => filterGithubRepos(data?.recentRepos ?? [], filters),
    [data, filters],
  );
  const filteredAuthorWip = useMemo(
    () => authorWipFromPulls(filteredPulls),
    [filteredPulls],
  );
  const filtersActive = githubDashboardFiltersActive(filters);

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
              Organisation{" "}
              <span className="font-mono text-foreground">{data.org}</span>
              {data.githubRepos.length > 0 ? (
                <>
                  {" "}
                  · Saved subset: {data.githubRepos.length}{" "}
                  {data.githubRepos.length === 1 ? "repository" : "repositories"}{" "}
                  <Link
                    href="/settings"
                    className="underline underline-offset-2"
                  >
                    Change
                  </Link>
                </>
              ) : null}
            </>
          ) : (
            "Connect GitHub in Settings to load org metrics."
          )}
        </div>
        <RefreshButton pending={pending} onClick={() => load()} />
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {data?.configured ? (
        <GithubTokenExpiryAlert
          tokenExpiresAt={data.tokenExpiresAt}
          linkToSettings
        />
      ) : null}

      {!pending && (!data || !data.configured) ? (
        <Alert>
          GitHub is not configured for your account.{" "}
          <Link
            href="/settings"
            className="underline underline-offset-2"
          >
            Add a token and organisation
          </Link>
          .
        </Alert>
      ) : null}

      {data?.error ? <Alert variant="error">{data.error}</Alert> : null}

      {data?.configured && data.metrics.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.metrics.map((metric) => (
            <Card key={metric.key} className="relative pr-8">
              <MetricHelp metricId={metric.key} />
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

      {data?.configured ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="mb-1">Filters</CardTitle>
              <CardDescription>
                Narrow the pull request, author, and repository tables. Metric
                cards use your saved repository subset from Settings.
              </CardDescription>
            </div>
            <Button
              variant="secondary"
              disabled={!filtersActive}
              onClick={() => setFilters(EMPTY_GITHUB_DASHBOARD_FILTERS)}
            >
              Clear filters
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Search" htmlFor="github-filter-query" className="mb-0">
              <Input
                id="github-filter-query"
                type="search"
                value={filters.query}
                onChange={(e) =>
                  setFilters((current) => ({ ...current, query: e.target.value }))
                }
                placeholder="Title, repo, or author"
              />
            </Field>
            <Field
              label="Repository"
              htmlFor="github-filter-repo"
              className="mb-0"
            >
              <Select
                id="github-filter-repo"
                value={filters.repository}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    repository: e.target.value,
                  }))
                }
              >
                <option value="">All repositories</option>
                {repositoryOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Author" htmlFor="github-filter-author" className="mb-0">
              <Select
                id="github-filter-author"
                value={filters.author}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    author: e.target.value,
                  }))
                }
              >
                <option value="">All authors</option>
                {authorOptions.map((login) => (
                  <option key={login} value={login}>
                    {login}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="State" htmlFor="github-filter-state" className="mb-0">
              <Select
                id="github-filter-state"
                value={filters.state}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    state: e.target.value as GithubPullStateFilter,
                  }))
                }
              >
                <option value="all">All states</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </Select>
            </Field>
            <Field label="Review" htmlFor="github-filter-review" className="mb-0">
              <Select
                id="github-filter-review"
                value={filters.review}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    review: e.target.value as GithubReviewFilter,
                  }))
                }
              >
                <option value="all">All reviews</option>
                <option value="needs_review">Needs review</option>
                <option value="reviewed">Reviewed</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div>
              <p className="text-sm text-foreground">Dependabot PRs</p>
              <p className="text-sm text-muted">
                {filters.includeDependabot
                  ? "Included in the tables below"
                  : "Hidden from the tables below"}
              </p>
            </div>
            <Toggle
              checked={filters.includeDependabot}
              label="Include Dependabot pull requests"
              onCheckedChange={(checked) =>
                setFilters((current) => ({
                  ...current,
                  includeDependabot: checked,
                }))
              }
            />
          </div>
        </Card>
      ) : null}

      {data?.configured && filteredAuthorWip.length > 0 ? (
        <Card>
          <CardTitle className="mb-1">Open PR WIP by author</CardTitle>
          <CardDescription className="mb-4">
            Authors with the most open pull requests in the current sample
            {filtersActive ? " (after filters)" : ""}.
          </CardDescription>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Author</TableHeaderCell>
                <TableHeaderCell>Open PRs</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAuthorWip.map((row) => (
                <TableRow key={row.login}>
                  <TableCell className="font-mono text-xs">
                    <button
                      type="button"
                      className="text-accent underline-offset-2 hover:underline"
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          author: row.login,
                        }))
                      }
                    >
                      {row.login}
                    </button>
                  </TableCell>
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
                Open PRs across the organisation, sorted by last update
                {filtersActive
                  ? ` · ${filteredPulls.length} of ${data.recentPullRequests.length} match filters`
                  : ""}
                .
              </CardDescription>
            </div>
          </div>
          <PullRequestsTable pulls={filteredPulls} emptyMessage={filtersActive ? "No pull requests match the filters." : undefined} />
        </Card>
      ) : null}

      {data?.configured && (filteredRepos.length > 0 || data.recentRepos.length > 0) ? (
        <Card>
          <CardTitle className="mb-1">Recently updated repositories</CardTitle>
          <CardDescription className="mb-4">
            Latest activity across org repositories
            {filtersActive
              ? ` · ${filteredRepos.length} of ${data.recentRepos.length} match filters`
              : ""}
            .
          </CardDescription>
          {filteredRepos.length === 0 ? (
            <p className="text-sm text-muted">No repositories match the filters.</p>
          ) : (
            <ReposTable repos={filteredRepos} />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function TablePager({
  from,
  to,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  from: number;
  to: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
      <span>
        {total === 0
          ? "Showing 0 of 0"
          : `Showing ${from}–${to} of ${total}`}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={!canPrev}
          onClick={onPrev}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!canNext}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function PullRequestsTable({
  pulls,
  emptyMessage = "No open pull requests found.",
}: {
  pulls: GithubPullSummary[];
  emptyMessage?: string;
}) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [pulls]);

  const paged = paginateItems(pulls, page, GITHUB_TABLE_PAGE_SIZE);

  if (pulls.length === 0) {
    return (
      <p className="text-sm text-muted">{emptyMessage}</p>
    );
  }

  return (
    <>
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
          {paged.items.map((pull) => (
            <TableRow key={pull.id}>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <a
                    href={pull.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    {repoNameWithoutOwner(pull.repository)}#{pull.number}
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
                  <Badge variant="warning" className="min-w-[7.25rem] justify-center text-center">
                    Needs review
                  </Badge>
                ) : (
                  <Badge variant="ok" className="min-w-[7.25rem] justify-center text-center">
                    Reviewed
                  </Badge>
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
      <TablePager
        from={paged.from}
        to={paged.to}
        total={paged.total}
        canPrev={paged.canPrev}
        canNext={paged.canNext}
        onPrev={() => setPage((current) => current - 1)}
        onNext={() => setPage((current) => current + 1)}
      />
    </>
  );
}

function ReposTable({ repos }: { repos: GithubOrgRepoSummary[] }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [repos]);

  const paged = paginateItems(repos, page, GITHUB_TABLE_PAGE_SIZE);

  return (
    <>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Repository</TableHeaderCell>
            <TableHeaderCell>Updated</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {paged.items.map((repo) => (
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
      <TablePager
        from={paged.from}
        to={paged.to}
        total={paged.total}
        canPrev={paged.canPrev}
        canNext={paged.canNext}
        onPrev={() => setPage((current) => current - 1)}
        onNext={() => setPage((current) => current + 1)}
      />
    </>
  );
}
