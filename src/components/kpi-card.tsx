"use client";

import { Card } from "@/components/ui/card";
import { MetricHelp } from "@/components/metric-help";

export function KpiCard({
  label,
  value,
  hint,
  metricId,
}: {
  label: string;
  value: string | number;
  hint?: string;
  metricId: string;
}) {
  return (
    <Card className="relative pr-8">
      <MetricHelp metricId={metricId} />
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}
