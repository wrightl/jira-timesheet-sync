'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KpiCard } from '@/components/kpi-card';
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
import { UtilisationLineChart } from '@/components/utilisation-line-chart';
import type { UtilisationPersonDetail } from '@/services/utilisation-service';

function statusBadge(
    status: UtilisationPersonDetail['person']['status'],
): 'ok' | 'warning' | 'danger' | 'muted' {
    if (status === 'ok') return 'ok';
    if (status === 'watch' || status === 'under') return 'warning';
    if (status === 'risk') return 'danger';
    return 'muted';
}

function formatHours(value: number): string {
    return `${value}h`;
}

function MixBar({
    billable,
    nonBillable,
}: {
    billable: number;
    nonBillable: number;
}) {
    const total = billable + nonBillable;
    if (total <= 0) {
        return <div className="h-2 rounded bg-background" />;
    }
    const billablePct = (billable / total) * 100;
    return (
        <div
            className="flex h-2 overflow-hidden rounded bg-warning/70"
            aria-hidden
        >
            <div className="h-2 bg-ok" style={{ width: `${billablePct}%` }} />
        </div>
    );
}

function HoursBar({
    hours,
    max,
    className = 'bg-warning',
}: {
    hours: number;
    max: number;
    className?: string;
}) {
    const width = max > 0 ? Math.min(100, (hours / max) * 100) : 0;
    return (
        <div className="h-2 rounded bg-background">
            <div
                className={`h-2 rounded ${className}`}
                style={{ width: `${width}%` }}
            />
        </div>
    );
}

export function UtilisationPersonDashboard({
    authed,
    userId,
    initialRangeDays = '7',
}: {
    authed: boolean;
    userId: string;
    initialRangeDays?: string;
}) {
    const router = useRouter();
    const [data, setData] = useState<UtilisationPersonDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [rangeDays, setRangeDays] = useState(initialRangeDays);

    const load = async (nextRange = rangeDays) => {
        setPending(true);
        setError(null);
        try {
            const params = new URLSearchParams({ rangeDays: nextRange });
            const res = await fetch(
                `/api/utilisation/${encodeURIComponent(userId)}?${params.toString()}`,
            );
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                    error?: string;
                } | null;
                setError(
                    res.status === 401
                        ? 'Sign in required'
                        : res.status === 404
                          ? 'This person was not found in Bitmap utilisation data.'
                          : (body?.error ?? 'Failed to load utilisation'),
                );
                setData(null);
                return;
            }
            setData((await res.json()) as UtilisationPersonDetail);
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
        if (authed) void load(rangeDays);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authed, userId, rangeDays]);

    const onRangeChange = (value: string) => {
        setRangeDays(value);
        router.replace(
            `/utilisation/${encodeURIComponent(userId)}?rangeDays=${value}`,
        );
    };

    if (!authed) {
        return (
            <p className="text-sm text-muted">
                Sign in to view people utilisation.
            </p>
        );
    }

    const person = data?.person;
    const topReason = data?.nonBillableByReason[0];
    const coveragePct =
        person && person.workingHours > 0
            ? Math.round((person.totalHours / person.workingHours) * 1000) / 10
            : null;
    const hoursToTarget = data?.hoursToTarget;
    const maxReasonHours = data?.nonBillableByReason[0]?.hours ?? 0;
    const maxProjectNonBillable = data?.nonBillableByProject[0]?.hours ?? 0;

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/utilisation"
                    className="text-sm text-accent hover:underline"
                >
                    ← Utilisation
                </Link>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
                            {person?.displayName ?? 'Person utilisation'}
                        </h1>
                        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                            {[person?.email, person?.teamName]
                                .filter(Boolean)
                                .join(' · ') ||
                                'Billable mix, project time, and where non-billable hours went.'}
                        </p>
                    </div>
                    {person ? (
                        <Badge variant={statusBadge(person.status)}>
                            {person.status}
                        </Badge>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <label className="block text-sm">
                    <span className="mb-1 block text-muted">Range</span>
                    <Select
                        value={rangeDays}
                        onChange={(e) => onRangeChange(e.target.value)}
                    >
                        <option value="1">1 day</option>
                        <option value="7">7 days</option>
                        <option value="14">14 days</option>
                        <option value="30">30 days</option>
                    </Select>
                </label>
                <RefreshButton pending={pending} onClick={() => load()} />
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}

            {!data && !error ? (
                <p className="text-sm text-muted">
                    {pending ? 'Loading…' : 'No utilisation data in this range.'}
                </p>
            ) : null}

            {data && person ? (
                <>
                    {hoursToTarget != null && hoursToTarget > 0 ? (
                        <Alert>
                            {person.displayName} is {formatHours(hoursToTarget)}{' '}
                            below the {data.targetUtilisationPct}% billable
                            target in this range
                            {topReason
                                ? `. Largest non-billable bucket: ${topReason.reason} (${formatHours(topReason.hours)}).`
                                : '.'}
                        </Alert>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <KpiCard
                            metricId="utilisation.pct"
                            label="Utilisation"
                            value={
                                person.utilisationPct != null
                                    ? `${person.utilisationPct}%`
                                    : '—'
                            }
                            hint={`Target ${data.targetUtilisationPct}%`}
                        />
                        <KpiCard
                            metricId="utilisation.billable_hours"
                            label="Billable"
                            value={formatHours(person.billableHours)}
                            hint={`Target ${formatHours(data.targetBillableHours)}`}
                        />
                        <KpiCard
                            metricId="utilisation.non_billable_hours"
                            label="Non-billable"
                            value={formatHours(person.nonBillableHours)}
                            hint={
                                person.totalHours > 0
                                    ? `${Math.round((person.nonBillableHours / person.totalHours) * 100)}% of logged time`
                                    : 'No time logged'
                            }
                        />
                        <KpiCard
                            metricId="utilisation.hours_to_target"
                            label="Hours to target"
                            value={
                                hoursToTarget == null
                                    ? '—'
                                    : hoursToTarget > 0
                                      ? formatHours(hoursToTarget)
                                      : hoursToTarget === 0
                                        ? 'On target'
                                        : `${formatHours(Math.abs(hoursToTarget))} over`
                            }
                            hint={`${formatHours(person.billableHours)} of ${formatHours(data.targetBillableHours)} billable`}
                        />
                        <KpiCard
                            metricId="utilisation.coverage_pct"
                            label="Timesheet coverage"
                            value={
                                coveragePct != null ? `${coveragePct}%` : '—'
                            }
                            hint={`${formatHours(person.totalHours)} logged of ${formatHours(person.workingHours)} contracted`}
                        />
                    </div>

                    <Card>
                        <CardTitle className="mb-1">
                            Utilisation over the range
                        </CardTitle>
                        <CardDescription className="mb-4">
                            Cumulative billable utilisation versus the{' '}
                            {data.targetUtilisationPct}% target.
                        </CardDescription>
                        <UtilisationLineChart
                            series={[
                                {
                                    key: person.key,
                                    label: person.displayName,
                                    color: 'var(--accent)',
                                    points: data.series,
                                },
                            ]}
                            targetPct={data.targetUtilisationPct}
                        />
                    </Card>

                    <Card>
                        <CardTitle className="mb-1">Time by project</CardTitle>
                        <CardDescription className="mb-4">
                            Where logged hours went in this range, including the
                            billable mix on each project.
                        </CardDescription>
                        {data.projects.length === 0 ? (
                            <p className="text-sm text-muted">
                                No countable timesheet entries in this range.
                            </p>
                        ) : (
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableHeaderCell>
                                            Project
                                        </TableHeaderCell>
                                        <TableHeaderCell>Client</TableHeaderCell>
                                        <TableHeaderCell>Billable</TableHeaderCell>
                                        <TableHeaderCell>
                                            Non-billable
                                        </TableHeaderCell>
                                        <TableHeaderCell>Total</TableHeaderCell>
                                        <TableHeaderCell>Share</TableHeaderCell>
                                        <TableHeaderCell>Mix</TableHeaderCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {data.projects.map((project) => (
                                        <TableRow
                                            key={
                                                project.projectId ??
                                                project.projectName
                                            }
                                        >
                                            <TableCell className="font-medium">
                                                {project.projectName}
                                            </TableCell>
                                            <TableCell>
                                                {project.clientName ?? '—'}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {formatHours(
                                                    project.billableHours,
                                                )}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {formatHours(
                                                    project.nonBillableHours,
                                                )}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {formatHours(project.totalHours)}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {project.pctOfTotal != null
                                                    ? `${project.pctOfTotal}%`
                                                    : '—'}
                                            </TableCell>
                                            <TableCell className="min-w-[8rem]">
                                                <MixBar
                                                    billable={
                                                        project.billableHours
                                                    }
                                                    nonBillable={
                                                        project.nonBillableHours
                                                    }
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </Card>

                    <Card className="border-warning/40">
                        <CardTitle className="mb-1">
                            Non-billable time
                        </CardTitle>
                        <CardDescription className="mb-4">
                            {person.nonBillableHours > 0
                                ? `${formatHours(person.nonBillableHours)} non-billable in this range. Reasons and projects below are the highest-leverage places to recover billable time.`
                                : 'No explicit non-billable time in this range.'}
                        </CardDescription>
                        {person.nonBillableHours <= 0 ? (
                            <p className="text-sm text-muted">
                                If utilisation is still below target, check
                                timesheet coverage — hours may be unlogged
                                rather than marked non-billable.
                            </p>
                        ) : (
                            <div className="grid gap-6 lg:grid-cols-2">
                                <div>
                                    <h3 className="mb-3 text-sm font-semibold">
                                        By reason
                                    </h3>
                                    <ul className="space-y-3">
                                        {data.nonBillableByReason.map(
                                            (row) => (
                                                <li key={row.reason}>
                                                    <div className="mb-1 flex justify-between gap-3 text-sm">
                                                        <span className="font-medium">
                                                            {row.reason}
                                                        </span>
                                                        <span className="font-mono text-xs text-muted">
                                                            {formatHours(
                                                                row.hours,
                                                            )}
                                                            {row.pctOfNonBillable !=
                                                            null
                                                                ? ` · ${row.pctOfNonBillable}%`
                                                                : ''}
                                                        </span>
                                                    </div>
                                                    <HoursBar
                                                        hours={row.hours}
                                                        max={maxReasonHours}
                                                    />
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                </div>
                                <div>
                                    <h3 className="mb-3 text-sm font-semibold">
                                        By project
                                    </h3>
                                    <ul className="space-y-3">
                                        {data.nonBillableByProject.map(
                                            (row) => (
                                                <li
                                                    key={
                                                        row.projectId ??
                                                        row.projectName
                                                    }
                                                >
                                                    <div className="mb-1 flex justify-between gap-3 text-sm">
                                                        <span>
                                                            <span className="font-medium">
                                                                {row.projectName}
                                                            </span>
                                                            {row.clientName ? (
                                                                <span className="block text-xs text-muted">
                                                                    {
                                                                        row.clientName
                                                                    }
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                        <span className="font-mono text-xs text-muted">
                                                            {formatHours(
                                                                row.hours,
                                                            )}
                                                            {row.pctOfNonBillable !=
                                                            null
                                                                ? ` · ${row.pctOfNonBillable}%`
                                                                : ''}
                                                        </span>
                                                    </div>
                                                    <HoursBar
                                                        hours={row.hours}
                                                        max={
                                                            maxProjectNonBillable
                                                        }
                                                    />
                                                    <p className="mt-1 text-xs text-muted">
                                                        {row.reasons
                                                            .map(
                                                                (reason) =>
                                                                    `${reason.reason} ${formatHours(reason.hours)}`,
                                                            )
                                                            .join(' · ')}
                                                    </p>
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </Card>
                </>
            ) : null}
        </div>
    );
}
