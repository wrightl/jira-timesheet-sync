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
import type { UtilisationResult } from '@/services/utilisation-service';

function statusBadge(
    status: UtilisationResult['people'][number]['status'],
): 'ok' | 'warning' | 'danger' | 'muted' {
    if (status === 'ok') return 'ok';
    if (status === 'watch' || status === 'under') return 'warning';
    if (status === 'risk') return 'danger';
    return 'muted';
}

export function UtilisationDashboard({ authed }: { authed: boolean }) {
    const [data, setData] = useState<UtilisationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [rangeDays, setRangeDays] = useState('7');
    const [teamId, setTeamId] = useState('all');
    const [userId, setUserId] = useState('all');

    const load = async () => {
        setPending(true);
        setError(null);
        try {
            const params = new URLSearchParams({ rangeDays });
            if (teamId !== 'all') params.set('teamId', teamId);
            if (userId !== 'all') params.set('userId', userId);
            const res = await fetch(`/api/utilisation?${params.toString()}`);
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

    if (!authed) {
        return (
            <p className="text-sm text-muted">
                Sign in to view people utilisation.
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
                <RefreshButton pending={pending} onClick={() => load()} />
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}

            <Card>
                <CardTitle className="mb-1">Billable utilisation</CardTitle>
                <CardDescription className="mb-4">
                    Billable hours from Bitmap timesheets versus each
                    person&apos;s contracted working hours in the range
                    (Bitmap hours_per_week, pro-rated). Planned and rejected
                    entries are excluded.
                </CardDescription>
                {!data || data.people.length === 0 ? (
                    <p className="text-sm text-muted">
                        {pending
                            ? 'Loading…'
                            : 'No utilisation data in this range. Add team members under Teams or ensure Bitmap timesheets exist.'}
                    </p>
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
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>
        </div>
    );
}
