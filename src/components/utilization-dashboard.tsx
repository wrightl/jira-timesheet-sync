'use client';

import { useEffect, useState } from 'react';
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
import type { UtilizationResult } from '@/services/utilization-service';

function statusBadge(
    status: UtilizationResult['people'][number]['status'],
): 'ok' | 'warning' | 'danger' | 'muted' {
    if (status === 'ok') return 'ok';
    if (status === 'watch' || status === 'under') return 'warning';
    if (status === 'risk') return 'danger';
    return 'muted';
}

export function UtilizationDashboard({ authed }: { authed: boolean }) {
    const [data, setData] = useState<UtilizationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [rangeDays, setRangeDays] = useState('7');
    const [teamId, setTeamId] = useState('all');

    const load = async () => {
        setPending(true);
        setError(null);
        try {
            const params = new URLSearchParams({ rangeDays });
            if (teamId !== 'all') params.set('teamId', teamId);
            const res = await fetch(`/api/utilization?${params.toString()}`);
            if (!res.ok) {
                setError(
                    res.status === 401
                        ? 'Sign in required'
                        : 'Failed to load utilization',
                );
                setData(null);
                return;
            }
            setData((await res.json()) as UtilizationResult);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load utilization',
            );
            setData(null);
        } finally {
            setPending(false);
        }
    };

    useEffect(() => {
        if (authed) void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authed, rangeDays, teamId]);

    if (!authed) {
        return (
            <p className="text-sm text-muted">
                Sign in to view people utilization.
            </p>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-3">
                <label className="block text-sm">
                    <span className="mb-1 block text-muted">Range</span>
                    <Select
                        value={rangeDays}
                        onChange={(e) => setRangeDays(e.target.value)}
                    >
                        <option value="7">7 days</option>
                        <option value="14">14 days</option>
                        <option value="30">30 days</option>
                    </Select>
                </label>
                <label className="block text-sm">
                    <span className="mb-1 block text-muted">Team</span>
                    <Select
                        value={teamId}
                        onChange={(e) => setTeamId(e.target.value)}
                    >
                        <option value="all">All people</option>
                        {(data?.teams ?? []).map((team) => (
                            <option key={team.id} value={team.id}>
                                {team.name}
                            </option>
                        ))}
                    </Select>
                </label>
                <RefreshButton pending={pending} onClick={() => load()} />
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}

            <Card>
                <CardTitle className="mb-1">People utilization</CardTitle>
                <CardDescription className="mb-4">
                    Hours from Jira worklog sync events vs weekly capacity.
                    Failed/skipped hours highlight billing leakage.
                </CardDescription>
                {!data || data.people.length === 0 ? (
                    <p className="text-sm text-muted">
                        {pending
                            ? 'Loading…'
                            : 'No utilization data in this range. Add team members under Teams or wait for syncs.'}
                    </p>
                ) : (
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>Person</TableHeaderCell>
                                <TableHeaderCell>Team</TableHeaderCell>
                                <TableHeaderCell>Logged</TableHeaderCell>
                                <TableHeaderCell>Synced</TableHeaderCell>
                                <TableHeaderCell>Failed</TableHeaderCell>
                                <TableHeaderCell>Utilization</TableHeaderCell>
                                <TableHeaderCell>Status</TableHeaderCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.people.map((person) => (
                                <TableRow key={person.key}>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">
                                                {person.displayName}
                                            </span>
                                            <span className="text-xs text-muted">
                                                {person.email ?? '—'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{person.teamName ?? '—'}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {person.loggedHours}h
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {person.syncedHours}h
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {person.failedHours}h
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {person.utilizationPct != null
                                            ? `${person.utilizationPct}%`
                                            : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={statusBadge(person.status)}
                                        >
                                            {person.status}
                                        </Badge>
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
