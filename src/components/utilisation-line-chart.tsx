'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import {
    TARGET_BILLABLE_UTILISATION_PCT,
    TEAM_SERIES_KEY,
    type UtilisationPersonSeries,
    type UtilisationSeriesPoint,
} from '@/services/utilisation-service';

const PERSON_COLORS = [
    '#0f766e',
    '#7c3aed',
    '#c2410c',
    '#0369a1',
    '#be185d',
    '#4d7c0f',
    '#a16207',
    '#4338ca',
    '#0e7490',
    '#9f1239',
];

function pickLabelIndices(length: number, maxLabels = 6): number[] {
    if (length <= maxLabels) {
        return Array.from({ length }, (_, i) => i);
    }
    const indices = new Set<number>();
    for (let i = 0; i < maxLabels; i += 1) {
        indices.add(Math.round((i / (maxLabels - 1)) * (length - 1)));
    }
    return [...indices].sort((a, b) => a - b);
}

function formatChartDate(date: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return date;
    const month = Number(match[2]);
    const day = Number(match[3]);
    return `${day}/${month}`;
}

function colorForPerson(index: number): string {
    return PERSON_COLORS[index % PERSON_COLORS.length]!;
}

export type ChartSeries = {
    key: string;
    label: string;
    color: string;
    points: UtilisationSeriesPoint[];
};

export function utilisationChartSeries(options: {
    teamSeries: UtilisationSeriesPoint[];
    personSeries: UtilisationPersonSeries[];
    includeTeamAverage?: boolean;
}): ChartSeries[] {
    const series: ChartSeries[] = [];
    if (options.includeTeamAverage !== false && options.teamSeries.length > 0) {
        series.push({
            key: TEAM_SERIES_KEY,
            label: 'Team average',
            color: 'var(--accent)',
            points: options.teamSeries,
        });
    }
    options.personSeries.forEach((person, index) => {
        series.push({
            key: person.key,
            label: person.displayName,
            color: colorForPerson(index),
            points: person.points,
        });
    });
    return series;
}

export function UtilisationLineChart({
    series,
    targetPct = TARGET_BILLABLE_UTILISATION_PCT,
    initiallyVisibleKeys,
    emptyLabel = 'No utilisation data in this range.',
}: {
    series: ChartSeries[];
    targetPct?: number;
    initiallyVisibleKeys?: string[];
    emptyLabel?: string;
}) {
    const defaultVisible = useMemo(() => {
        if (initiallyVisibleKeys && initiallyVisibleKeys.length > 0) {
            return new Set(initiallyVisibleKeys);
        }
        const keys = series.map((row) => row.key);
        if (keys.length <= 9) return new Set(keys);
        const visible = new Set<string>();
        if (keys.includes(TEAM_SERIES_KEY)) visible.add(TEAM_SERIES_KEY);
        return visible.size > 0 ? visible : new Set(keys.slice(0, 8));
    }, [initiallyVisibleKeys, series]);

    const [visible, setVisible] = useState<Set<string>>(defaultVisible);
    const visibleKeys = visible.size > 0 ? visible : defaultVisible;

    const plotted = series.filter((row) => visibleKeys.has(row.key));
    const dates = series[0]?.points.map((point) => point.date) ?? [];
    const values = plotted.flatMap((row) =>
        row.points
            .map((point) => point.utilisationPct)
            .filter((value): value is number => value != null),
    );
    const max = Math.max(100, targetPct, ...values, 0);

    if (dates.length === 0) {
        return <p className="text-sm text-muted">{emptyLabel}</p>;
    }

    const width = 720;
    const height = 260;
    const padLeft = 40;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 36;
    const plotBottom = height - padBottom;
    const plotWidth = width - padLeft - padRight;

    const x = (i: number) =>
        padLeft + (i / Math.max(1, dates.length - 1)) * plotWidth;
    const y = (v: number) =>
        plotBottom - (v / (max || 1)) * (plotBottom - padTop);

    const toPath = (points: UtilisationSeriesPoint[]) =>
        points
            .map((point, i) => {
                const value = point.utilisationPct ?? 0;
                return `${i === 0 ? 'M' : 'L'}${x(i)},${y(value)}`;
            })
            .join(' ');

    const labelIndices = pickLabelIndices(dates.length);
    const yTicks = [0, targetPct, 100].filter(
        (tick, index, all) => tick <= max && all.indexOf(tick) === index,
    );
    if (max > 100) yTicks.push(Math.round(max));

    const toggle = (key: string) => {
        setVisible((current) => {
            const next = new Set(current.size > 0 ? current : defaultVisible);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return (
        <div className="space-y-4">
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="h-auto w-full"
                role="img"
                aria-label={`Billable utilisation versus the ${targetPct}% target`}
            >
                {yTicks.map((tick) => (
                    <g key={tick}>
                        <line
                            x1={padLeft}
                            y1={y(tick)}
                            x2={width - padRight}
                            y2={y(tick)}
                            stroke="var(--border)"
                            strokeWidth="1"
                            strokeDasharray={tick === targetPct ? '5 4' : undefined}
                        />
                        <text
                            x={padLeft - 8}
                            y={y(tick) + 4}
                            textAnchor="end"
                            fill="var(--muted)"
                            style={{ fontSize: 11 }}
                        >
                            {tick}%
                        </text>
                    </g>
                ))}
                <line
                    x1={padLeft}
                    y1={y(targetPct)}
                    x2={width - padRight}
                    y2={y(targetPct)}
                    stroke="var(--muted)"
                    strokeWidth="1.75"
                    strokeDasharray="5 4"
                />
                {plotted.map((row) => (
                    <g key={row.key}>
                        <path
                            d={toPath(row.points)}
                            fill="none"
                            stroke={row.color}
                            strokeWidth={row.key === TEAM_SERIES_KEY ? 2.75 : 2}
                        />
                        {row.points.map((point, i) => (
                            <circle
                                key={`${row.key}-${point.date}`}
                                cx={x(i)}
                                cy={y(point.utilisationPct ?? 0)}
                                r="3"
                                fill={row.color}
                            >
                                <title>
                                    {`${row.label}: ${point.utilisationPct ?? '—'}% on ${point.date}`}
                                </title>
                            </circle>
                        ))}
                    </g>
                ))}
                {labelIndices.map((i) => {
                    const cx = x(i);
                    const label = formatChartDate(dates[i] ?? '');
                    const anchor =
                        i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle';
                    return (
                        <g key={`${dates[i]}-${i}`}>
                            <line
                                x1={cx}
                                y1={plotBottom}
                                x2={cx}
                                y2={plotBottom + 4}
                                stroke="var(--border)"
                                strokeWidth="1"
                            />
                            <text
                                x={cx}
                                y={height - 10}
                                textAnchor={anchor}
                                fill="var(--muted)"
                                style={{ fontSize: 11 }}
                            >
                                {label}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <p className="text-xs text-muted">
                Dotted line is the {targetPct}% billable target. Values are
                cumulative billable hours versus contracted working hours through
                each day in the range.
            </p>
            {series.length > 1 ? (
                <ul className="flex flex-wrap gap-2">
                    {series.map((row) => {
                        const active = visibleKeys.has(row.key);
                        const swatch = (
                            <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{
                                    background: active ? row.color : 'var(--border)',
                                }}
                            />
                        );
                        return (
                            <li key={row.key}>
                                <button
                                    type="button"
                                    onClick={() => toggle(row.key)}
                                    aria-pressed={active}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                                        active
                                            ? 'border-border bg-background text-foreground'
                                            : 'border-transparent text-muted',
                                    )}
                                >
                                    {swatch}
                                    {row.label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}
