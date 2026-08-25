'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
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
import {
    UtilisationLineChart,
    utilisationChartSeries,
} from '@/components/utilisation-line-chart';
import { cn } from '@/lib/cn';
import {
    TARGET_BILLABLE_UTILISATION_PCT,
    TEAM_SERIES_KEY,
    type UtilisationResult,
} from '@/services/utilisation-service';

function statusBadge(
    status: UtilisationResult['people'][number]['status'],
): 'ok' | 'warning' | 'danger' | 'muted' {
    if (status === 'ok') return 'ok';
    if (status === 'watch' || status === 'under') return 'warning';
    if (status === 'risk') return 'danger';
    return 'muted';
}

function personHref(key: string, rangeDays: string): string {
    return `/utilisation/${encodeURIComponent(key)}?rangeDays=${rangeDays}`;
}

export function UtilisationDashboard({ authed }: { authed: boolean }) {
    const [data, setData] = useState<UtilisationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [rangeDays, setRangeDays] = useState('7');
    const [teamId, setTeamId] = useState('all');
    const [userId, setUserId] = useState('all');
    const [view, setView] = useState<'table' | 'chart'>('table');

    const load = async () => {
        setPending(true);
        setError(null);
        try {
            const params = new URLSearchParams({ rangeDays });
            if (teamId !== 'all') params.set('teamId', teamId);
            if (userId !== 'all') params.set('userId', userId);
            const res = await fetch(`/api/utilisation?${params.toString()}`, {
                cache: 'no-store',
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                setError(
                    res.status === 401
                        ? 'Sign in required'
                        : (body?.error ?? 'Failed to load utilisation'),
                );
                setData(null);
                return;
            }
            setData((await res.json()) as UtilisationResult);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load utilisation',
            );
            setData(null);
        } finally {
            setPending(false);
        }
    };

    useEffect(() => {
        if (authed) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authed, rangeDays, teamId, userId]);

    const chartSeries = useMemo(() => {
        if (!data) return [];
        const people =
            userId === 'all'
                ? data.personSeries
                : data.personSeries.filter((person) => person.key === userId);
        return utilisationChartSeries({
            teamSeries: data.series,
            personSeries: people,
            includeTeamAverage: userId === 'all' && people.length > 1,
        });
    }, [data, userId]);

    const initiallyVisibleKeys = useMemo(() => {
        if (userId !== 'all') return [userId];
        const keys = chartSeries.map((row) => row.key);
        if (keys.length <= 9) return keys;
        const belowTarget = (data?.people ?? [])
            .filter(
                (person) =>
                    person.utilisationPct != null &&
                    person.utilisationPct < TARGET_BILLABLE_UTILISATION_PCT,
            )
            .map((person) => person.key);
        return [
            TEAM_SERIES_KEY,
            ...belowTarget.filter((key) => keys.includes(key)),
        ];
    }, [chartSeries, data?.people, userId]);

    if (!authed) {
        return (
            <p className="text-sm text-muted">
                Sign in to view people utilisation.
            </p>
        );
    }

    const empty = !data || !data.people || data.people.length === 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-3">
                <label className="block text-sm">
                    <span className="mb-1 block text-muted">Range</span>
                    <Select
                        value={rangeDays}
                        onChange={(e) => setRangeDays(e.target.value)}
                    >
                        <option value="1">1 day</option>
                        <option value="7">7 days</option>
                        <option value="14">14 days</option>
                        <option value="30">30 days</option>
                    </Select>
                </label>
                <label className="block text-sm">
                    <span className="mb-1 block text-muted">Person</span>
                    <Select
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                    >
                        <option value="all">All people</option>
                        {(data?.users ?? []).map((user) => (
                            <option key={user.id} value={user.id}>
                                {user.displayName}
                            </option>
                        ))}
                    </Select>
                </label>
                <label className="block text-sm">
                    <span className="mb-1 block text-muted">Team</span>
                    <Select
                        value={teamId}
                        onChange={(e) => setTeamId(e.target.value)}
                    >
                        <option value="all">All teams</option>
                        {(data?.teams ?? []).map((team) => (
                            <option key={team.id} value={team.id}>
                                {team.name}
                            </option>
                        ))}
                    </Select>
                </label>
                <div className="block text-sm">
                    <span className="mb-1 block text-muted">View</span>
                    <div
                        role="tablist"
                        aria-label="Utilisation view"
                        className="inline-flex h-10 items-center rounded-md border border-border bg-card p-0.5"
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={view === 'table'}
                            className={cn(
                                'h-9 rounded px-3 text-sm font-medium',
                                view === 'table'
                                    ? 'bg-accent-muted text-accent'
                                    : 'text-muted hover:text-foreground',
                            )}
                            onClick={() => setView('table')}
                        >
                            Table
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={view === 'chart'}
                            className={cn(
                                'h-9 rounded px-3 text-sm font-medium',
                                view === 'chart'
                                    ? 'bg-accent-muted text-accent'
                                    : 'text-muted hover:text-foreground',
                            )}
                            onClick={() => setView('chart')}
                        >
                            Chart
                        </button>
                    </div>
                </div>
                <RefreshButton pending={pending} onClick={() => load()} />
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}

            <Card>
                <CardTitle className="mb-1">Billable utilisation</CardTitle>
                <CardDescription className="mb-4">
                    Billable hours from Bitmap timesheets versus each
                    person&apos;s contracted working hours in the range
                    (Bitmap hours_per_week, pro-rated). Planned and rejected
                    entries are excluded. The chart uses a dotted{' '}
                    {data?.targetUtilisationPct ??
                        TARGET_BILLABLE_UTILISATION_PCT}
                    % target line.
                </CardDescription>
                {pending && empty ? (
                    <p className="text-sm text-muted">Loading…</p>
                ) : error && empty ? (
                    <p className="text-sm text-muted">
                        Utilisation could not be loaded. Check Bitmap
                        credentials under App Settings, then refresh.
                    </p>
                ) : empty ? (
                    <p className="text-sm text-muted">
                        No utilisation data in this range. Add team members
                        under Teams or ensure Bitmap timesheets exist.
                    </p>
                ) : view === 'chart' ? (
                    <UtilisationLineChart
                        key={`${rangeDays}-${teamId}-${userId}-${data?.generatedAt ?? ''}`}
                        series={chartSeries}
                        targetPct={
                            data?.targetUtilisationPct ??
                            TARGET_BILLABLE_UTILISATION_PCT
                        }
                        initiallyVisibleKeys={initiallyVisibleKeys}
                    />
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>Person</TableHeaderCell>
                                <TableHeaderCell>Team</TableHeaderCell>
                                <TableHeaderCell>Billable</TableHeaderCell>
                                <TableHeaderCell>Non-billable</TableHeaderCell>
                                <TableHeaderCell>Working</TableHeaderCell>
                                <TableHeaderCell>Utilisation</TableHeaderCell>
                                <TableHeaderCell>Status</TableHeaderCell>
                                <TableHeaderCell>
                                    <span className="sr-only">Details</span>
                                </TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.people.map((person) => (
                                <TableRow key={person.key}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <Link
                                                href={personHref(
                                                    person.key,
                                                    rangeDays,
                                                )}
                                                className="font-medium text-accent hover:underline"
                                            >
                                                {person.displayName}
                                            </Link>
                                            <span className="text-xs text-muted">
                                                {person.email ?? '—'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {person.teamName ?? '—'}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {person.billableHours}h
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {person.nonBillableHours}h
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {person.workingHours}h
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {person.utilisationPct != null
                                            ? `${person.utilisationPct}%`
                                            : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={statusBadge(person.status)}
                                        >
                                            {person.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Link
                                            href={personHref(
                                                person.key,
                                                rangeDays,
                                            )}
                                            className="text-sm text-accent hover:underline"
                                        >
                                            Details
                                        </Link>
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
