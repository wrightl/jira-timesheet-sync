'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { StatusNarrative } from '@/services/status-narrative-service';
import type { PortfolioResult } from '@/lib/portfolio';

export function StatusNarrativePanel({ authed }: { authed: boolean }) {
    const searchParams = useSearchParams();
    const initialProjectId = searchParams.get('projectId') ?? '';
    const [projectId, setProjectId] = useState(initialProjectId);
    const [portfolio, setPortfolio] = useState<PortfolioResult | null>(null);
    const [narrative, setNarrative] = useState<StatusNarrative | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!authed) return;
        void (async () => {
            const res = await fetch('/api/portfolio');
            if (res.ok) {
                setPortfolio((await res.json()) as PortfolioResult);
            }
        })();
    }, [authed]);

    const load = async (id = projectId) => {
        if (!id.trim()) {
            setError('Choose a project');
            return;
        }
        setPending(true);
        setError(null);
        setCopied(false);
        try {
            const res = await fetch(
                `/api/status/${encodeURIComponent(id.trim())}`,
            );
            if (!res.ok) {
                setError(
                    res.status === 401
                        ? 'Sign in required'
                        : 'Failed to build status narrative',
                );
                setNarrative(null);
                return;
            }
            setNarrative((await res.json()) as StatusNarrative);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to build status narrative',
            );
            setNarrative(null);
        } finally {
            setPending(false);
        }
    };

    useEffect(() => {
        if (authed && initialProjectId) void load(initialProjectId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authed, initialProjectId]);

    if (!authed) {
        return (
            <p className="text-sm text-muted">
                Sign in to generate weekly status packs.
            </p>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardTitle className="mb-1">Weekly status narrative</CardTitle>
                <CardDescription className="mb-4">
                    Template-driven exec pack from portfolio + project metrics.
                    Copy Markdown into Slack or a doc.
                </CardDescription>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="block flex-1 text-sm">
                        <span className="mb-1 block text-muted">Project</span>
                        <select
                            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                        >
                            <option value="">Select a project…</option>
                            {(portfolio?.projects ?? []).map((p) => (
                                <option key={p.projectId} value={p.projectId}>
                                    {(p.clientName
                                        ? `${p.clientName} · `
                                        : '') +
                                        (p.projectName ??
                                            p.projectKey ??
                                            p.projectId)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block flex-1 text-sm">
                        <span className="mb-1 block text-muted">
                            Or project id
                        </span>
                        <Input
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            placeholder="Bitmap project id"
                        />
                    </label>
                    <Button
                        type="button"
                        disabled={pending}
                        onClick={() => load()}
                    >
                        {pending ? 'Generating…' : 'Generate'}
                    </Button>
                </div>
            </Card>

            {error ? <Alert variant="error">{error}</Alert> : null}

            {narrative ? (
                <Card>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <CardTitle>{narrative.title}</CardTitle>
                            <CardDescription>
                                Generated {narrative.generatedAt}
                            </CardDescription>
                        </div>
                        <Button
                            type="button"
                            onClick={async () => {
                                await navigator.clipboard.writeText(
                                    narrative.markdown,
                                );
                                setCopied(true);
                            }}
                        >
                            {copied ? 'Copied' : 'Copy Markdown'}
                        </Button>
                    </div>
                    <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-relaxed">
                        {narrative.markdown}
                    </pre>
                </Card>
            ) : null}
        </div>
    );
}
