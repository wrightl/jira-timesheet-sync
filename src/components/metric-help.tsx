"use client";

import { useCallback, useState, type SVGProps } from "react";
import { Dialog } from "@/components/ui/dialog";
import { getMetricHelp } from "@/lib/metric-help";
import { cn } from "@/lib/cn";

function IconQuestionMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path
        d="M9.4 9.4a2.6 2.6 0 1 1 3.5 2.45c-.74.36-1.4.9-1.4 1.75V14.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MetricHelp({
  metricId,
  className,
}: {
  metricId: string;
  className?: string;
}) {
  const help = getMetricHelp(metricId);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!help) return null;

  return (
    <div className={cn("absolute right-2 top-2 z-10", className)}>
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground"
        aria-label={`How ${help.title} is calculated`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <IconQuestionMark className="h-4 w-4" />
      </button>
      <Dialog open={open} onClose={close} title={help.title}>
        <div className="space-y-4">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              How it is calculated
            </h3>
            <p className="mt-1 leading-relaxed">{help.formula}</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Data sources
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed">
              {help.sources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </section>
          {help.unavailable ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                When it is blank / unavailable
              </h3>
              <p className="mt-1 leading-relaxed">{help.unavailable}</p>
            </section>
          ) : null}
          {help.status ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Status
              </h3>
              <p className="mt-1 leading-relaxed">{help.status}</p>
            </section>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
