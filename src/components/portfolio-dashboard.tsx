'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Select } from '@/components/ui/select';
import {
    filterPortfolioResult,
    type PortfolioResult,
    type PortfolioRiskTier,
} from '@/lib/portfolio';
import {
    getCachedPortfolio,
    hydratePortfolioDashboardSelectionFromStorage,
    invalidateCachedPortfolio,
    isPortfolioDashboardRiskFilter,
    readPortfolioDashboardCache,
    setCachedPortfolio,
    setPortfolioDashboardSelection,
    type PortfolioDashboardRiskFilter,
} from '@/lib/portfolio-dashboard-cache';

type PortfolioApiResult = PortfolioResult & {
    teams?: Array<{ id: string; name: string }>;
};

function riskBadge(
    tier: PortfolioRiskTier,
): 'ok' | 'warning' | 'danger' | 'muted' {
    if (tier === 'ok') return 'ok';
    if (tier === 'watch') return 'warning';
    if (tier === 'risk') return 'danger';
    return 'muted';
}

export function PortfolioDashboard({ authed }: { authed: boolean }) {
    const initial = readPortfolioDashboardCache();
    const [data, setData] = useState<PortfolioApiResult | null>(
        () => initial.data,
    );
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [clientFilter, setClientFilter] = useState(
        () => initial.clientFilter,
    );
    const [riskFilter, setRiskFilter] = useState<PortfolioDashboardRiskFilter>(
        () => initial.riskFilter,
    );
    const [ownerFilter, setOwnerFilter] = useState(() => initial.ownerFilter);
    const [teamFilter, setTeamFilter] = useState('all');
    const [mineOnly, setMineOnly] = useState(false);
    const [selectionReady, setSelectionReady] = useState(false);

    const load = useCallback(
        async (options?: { refresh?: boolean; mine?: boolean }) => {
            const useMine = options?.mine ?? mineOnly;
            if (!options?.refresh && !useMine) {
                const cached = getCachedPortfolio();
                if (cached) {
                    setData(cached);
                    return;
                }
            }

            setPending(true);
            setError(null);
            if (options?.refresh) invalidateCachedPortfolio();
            try {
                const qs = useMine ? '?mine=1' : '';
                const res = await fetch(`/api/portfolio${qs}`);
                if (!res.ok) {
                    setError(
                        res.status === 401
                            ? 'Sign in required'
                            : 'Failed to load portfolio',
                    );
                    if (options?.refresh) setData(null);
                    return;
                }
                const next = (await res.json()) as PortfolioApiResult;
                if (!useMine) setCachedPortfolio(next);
                setData(next);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Failed to load portfolio',
                );
                if (options?.refresh) setData(null);
            } finally {
                setPending(false);
            }
        },
        [mineOnly],
    );

    useEffect(() => {
        const stored = hydratePortfolioDashboardSelectionFromStorage();
        if (stored) {
            // Intentional: hydrate from localStorage only after mount (SSR-safe).
            // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount localStorage hydrate
            setClientFilter(stored.clientFilter);
            setRiskFilter(stored.riskFilter);
            setOwnerFilter(stored.ownerFilter);
        }
        setSelectionReady(true);
    }, []);

    useEffect(() => {
        if (!selectionReady) return;
        setPortfolioDashboardSelection({
            clientFilter,
            riskFilter,
            ownerFilter,
        });
    }, [selectionReady, clientFilter, riskFilter, ownerFilter]);

    useEffect(() => {
        if (!authed || !selectionReady) return;
        let cancelled = false;

        void (async () => {
            await Promise.resolve();
            if (cancelled) return;
            await load({ mine: mineOnly });
        })();

        return () => {
            cancelled = true;
        };
    }, [authed, selectionReady, load, mineOnly]);

    const clients = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of data?.projects ?? []) {
            if (p.clientId) map.set(p.clientId, p.clientName ?? p.clientId);
        }
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [data]);

    const teams = data?.teams ?? [];

    const view = useMemo(
        () =>
            data
                ? filterPortfolioResult(data, {
                      clientId: clientFilter,
                      riskTier: riskFilter,
                      owner: ownerFilter,
                      teamId: teamFilter,
                  })
                : null,
        [data, clientFilter, riskFilter, ownerFilter, teamFilter],
    );

    if (!authed) {
        return (
            <p className="text-sm text-muted">Sign in to view the portfolio.</p>
        );
    }

    const summary = view?.summary;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    <label className="block text-sm">
                        <span className="mb-1 block text-muted">Client</span>
                        <Select
                            value={clientFilter}
                            onChange={(e) => setClientFilter(e.target.value)}
                        >
                            <option value="all">All clients</option>
                            {clients.map(([id, name]) => (
                                <option key={id} value={id}>
                                    {name}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="block text-sm">
                        <span className="mb-1 block text-muted">Risk</span>
                        <Select
                            value={riskFilter}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (isPortfolioDashboardRiskFilter(value)) {
                                    setRiskFilter(value);
                                }
                            }}
                        >
                            <option value="all">All tiers</option>
                            <option value="risk">Risk</option>
                            <option value="watch">Watch</option>
                            <option value="ok">Ok</option>
                        </Select>
                    </label>
                    <label className="block text-sm">
                        <span className="mb-1 block text-muted">Team</span>
                        <Select
                            value={teamFilter}
                            onChange={(e) => setTeamFilter(e.target.value)}
                        >
                            <option value="all">All teams</option>
                            {teams.map((team) => (
                                <option key={team.id} value={team.id}>
                                    {team.name}
                                </option>
                            ))}
                        </Select>
                    </label>
                    <label className="block text-sm">
                        <span className="mb-1 block text-muted">Owner</span>
                        <Input
                            value={ownerFilter}
                            onChange={(e) => setOwnerFilter(e.target.value)}
                            placeholder="Filter by owner"
                        />
                    </label>
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="flex items-center gap-2 pb-2 text-sm">
                            <input
                                type="checkbox"
                                checked={mineOnly}
                                onChange={(e) => setMineOnly(e.target.checked)}
                            />
                            <span className="text-muted">My risk</span>
                        </label>
                        <RefreshButton
                            pending={pending}
                            onClick={() =>
                                void load({ refresh: true, mine: mineOnly })
                            }
                            title="Reload portfolio"
                            aria-label="Reload portfolio from Bitmap"
                        />
                    </div>
                </div>
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}
            {view?.error ? <Alert variant="error">{view.error}</Alert> : null}

            {summary ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Card>
                        <CardTitle className="text-sm text-muted">
                            Active projects
                        </CardTitle>
                        <p className="mt-2 text-3xl font-semibold">
                            {summary.projectCount}
                        </p>
                    </Card>
                    <Card>
                        <CardTitle className="text-sm text-muted">Risk</CardTitle>
                        <p className="mt-2 text-3xl font-semibold">
                            {summary.riskCount}
                        </p>
                    </Card>
                    <Card>
                        <CardTitle className="text-sm text-muted">Watch</CardTitle>
                        <p className="mt-2 text-3xl font-semibold">
                            {summary.watchCount}
                        </p>
                    </Card>
                    <Card>
                        <CardTitle className="text-sm text-muted">Ok</CardTitle>
                        <p className="mt-2 text-3xl font-semibold">
                            {summary.okCount}
                        </p>
                    </Card>
                    <Card>
                        <CardTitle className="text-sm text-muted">
                            Avg burn
                        </CardTitle>
                        <p className="mt-2 text-3xl font-semibold">
                            {summary.avgBudgetBurnPct != null
                                ? `${summary.avgBudgetBurnPct}%`
                                : '—'}
                        </p>
                        <CardDescription className="mt-1">
                            Open sync failures: {view?.syncFailedOpen ?? 0}
                        </CardDescription>
                    </Card>
                </div>
            ) : null}

            <Card>
                <CardTitle className="mb-1">Portfolio projects</CardTitle>
                <CardDescription className="mb-4">
                    Cross-client health from Bitmap active projects whose start
                    and end dates include today, including staffing ask vs end
                    date. Open a row for detail or weekly status.
                </CardDescription>
                {!view || view.projects.length === 0 ? (
                    <p className="text-sm text-muted">
                        {pending && !data
                            ? 'Loading…'
                            : 'No projects match the current filters.'}
                    </p>
                ) : (
                    <TablePortfolio projects={view.projects} />
                )}
            </Card>
        </div>
    );
}

function TablePortfolio({
    projects,
}: {
    projects: PortfolioResult['projects'];
}) {
    return (
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
                <tr className="border-b border-border text-muted">
                    <th className="px-2 py-2 font-medium">Project</th>
                    <th className="px-2 py-2 font-medium">Client</th>
                    <th className="px-2 py-2 font-medium">Owner / team</th>
                    <th className="px-2 py-2 font-medium">Burn</th>
                    <th className="px-2 py-2 font-medium">Runway</th>
                    <th className="px-2 py-2 font-medium">Staffing ask</th>
                    <th className="px-2 py-2 font-medium">Risk</th>
                    <th className="px-2 py-2 font-medium">Actions</th>
                </tr>
            </thead>
            <tbody>
                {projects.map((project) => (
                    <tr
                        key={project.projectId}
                        className="border-b border-border/60 align-top"
                    >
                        <td className="px-2 py-3">
                            <div className="flex flex-col">
                                <span className="font-medium">
                                    {project.projectName ??
                                        project.projectKey ??
                                        project.projectId}
                                </span>
                                <span className="text-xs text-muted">
                                    {project.projectKey}
                                </span>
                            </div>
                        </td>
                        <td className="px-2 py-3">
                            {project.clientName ?? '—'}
                        </td>
                        <td className="px-2 py-3">
                            <div className="flex flex-col gap-0.5">
                                <span>{project.ownerName ?? '—'}</span>
                                {project.owningTeamNames?.length ? (
                                    <span className="text-xs text-muted">
                                        {project.owningTeamNames.join(', ')}
                                    </span>
                                ) : null}
                            </div>
                        </td>
                        <td className="px-2 py-3 font-mono text-xs">
                            {project.budgetBurnPct != null
                                ? `${project.budgetBurnPct}%`
                                : '—'}
                        </td>
                        <td className="px-2 py-3 font-mono text-xs">
                            {project.runwayDays != null
                                ? `${project.runwayDays}d`
                                : '—'}
                        </td>
                        <td className="px-2 py-3 text-xs">
                            <div className="flex flex-col gap-0.5">
                                <span>{project.staffingAsk ?? '—'}</span>
                                {project.forecastConfidence &&
                                project.forecastConfidence !== 'unavailable' ? (
                                    <span className="text-muted">
                                        conf. {project.forecastConfidence}
                                    </span>
                                ) : null}
                            </div>
                        </td>
                        <td className="px-2 py-3">
                            <Badge variant={riskBadge(project.riskTier)}>
                                {project.riskTier}
                            </Badge>
                        </td>
                        <td className="px-2 py-3">
                            <div className="flex flex-wrap gap-2 text-sm">
                                <Link
                                    href={`/projects?projectId=${encodeURIComponent(project.projectId)}${
                                        project.clientId
                                            ? `&clientId=${encodeURIComponent(project.clientId)}`
                                            : ''
                                    }`}
                                    className="text-accent underline-offset-2 hover:underline"
                                >
                                    Detail
                                </Link>
                                <Link
                                    href={`/status?projectId=${encodeURIComponent(project.projectId)}`}
                                    className="text-accent underline-offset-2 hover:underline"
                                >
                                    Status
                                </Link>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
