'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Select } from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from '@/components/ui/table';
import type { PortfolioResult, PortfolioRiskTier } from '@/lib/portfolio';

function riskBadge(
    tier: PortfolioRiskTier,
): 'ok' | 'warning' | 'danger' | 'muted' {
    if (tier === 'ok') return 'ok';
    if (tier === 'watch') return 'warning';
    if (tier === 'risk') return 'danger';
    return 'muted';
}

export function PortfolioDashboard({ authed }: { authed: boolean }) {
    const [data, setData] = useState<PortfolioResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [clientFilter, setClientFilter] = useState('all');
    const [riskFilter, setRiskFilter] = useState('all');
    const [ownerFilter, setOwnerFilter] = useState('');

    const load = async () => {
        setPending(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (clientFilter !== 'all') params.set('clientId', clientFilter);
            if (riskFilter !== 'all') params.set('riskTier', riskFilter);
            if (ownerFilter.trim()) params.set('owner', ownerFilter.trim());
            const res = await fetch(`/api/portfolio?${params.toString()}`);
            if (!res.ok) {
                setError(
                    res.status === 401
                        ? 'Sign in required'
                        : 'Failed to load portfolio',
                );
                setData(null);
                return;
            }
            setData((await res.json()) as PortfolioResult);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to load portfolio',
            );
            setData(null);
        } finally {
            setPending(false);
        }
    };

    useEffect(() => {
        if (authed) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authed, clientFilter, riskFilter]);

    const clients = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of data?.projects ?? []) {
            if (p.clientId) map.set(p.clientId, p.clientName ?? p.clientId);
        }
        return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [data]);

    if (!authed) {
        return (
            <p className="text-sm text-muted">Sign in to view the portfolio.</p>
        );
    }

    const summary = data?.summary;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="grid flex-1 gap-3 sm:grid-cols-3">
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
                            onChange={(e) => setRiskFilter(e.target.value)}
                        >
                            <option value="all">All tiers</option>
                            <option value="risk">Risk</option>
                            <option value="watch">Watch</option>
                            <option value="ok">Ok</option>
                        </Select>
                    </label>
                    <label className="block text-sm">
                        <span className="mb-1 block text-muted">Owner</span>
                        <div className="flex gap-2">
                            <Input
                                value={ownerFilter}
                                onChange={(e) => setOwnerFilter(e.target.value)}
                                placeholder="Filter by owner"
                            />
                            <RefreshButton
                                pending={pending}
                                onClick={() => load()}
                            />
                        </div>
                    </label>
                </div>
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}
            {data?.error ? <Alert variant="error">{data.error}</Alert> : null}

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
                            Open sync failures: {data?.syncFailedOpen ?? 0}
                        </CardDescription>
                    </Card>
                </div>
            ) : null}

            <Card>
                <CardTitle className="mb-1">Portfolio projects</CardTitle>
                <CardDescription className="mb-4">
                    Cross-client health from Bitmap active projects. Open a row
                    for detail or weekly status.
                </CardDescription>
                {!data || data.projects.length === 0 ? (
                    <p className="text-sm text-muted">
                        {pending
                            ? 'Loading…'
                            : 'No projects match the current filters.'}
                    </p>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>Project</TableHeaderCell>
                                <TableHeaderCell>Client</TableHeaderCell>
                                <TableHeaderCell>Owner</TableHeaderCell>
                                <TableHeaderCell>Burn</TableHeaderCell>
                                <TableHeaderCell>Runway</TableHeaderCell>
                                <TableHeaderCell>Risk</TableHeaderCell>
                                <TableHeaderCell>Actions</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.projects.map((project) => (
                                <TableRow key={project.projectId}>
                                    <TableCell>
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
                                    </TableCell>
                                    <TableCell>
                                        {project.clientName ?? '—'}
                                    </TableCell>
                                    <TableCell>
                                        {project.ownerName ?? '—'}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {project.budgetBurnPct != null
                                            ? `${project.budgetBurnPct}%`
                                            : '—'}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {project.runwayDays != null
                                            ? `${project.runwayDays}d`
                                            : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={riskBadge(project.riskTier)}
                                        >
                                            {project.riskTier}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-2 text-sm">
                                            <Link
                                                href={`/projects`}
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
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>
        </div>
    );
}
