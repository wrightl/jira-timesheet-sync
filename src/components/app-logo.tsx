import type { SVGProps } from 'react';

type LogoProps = SVGProps<SVGSVGElement> & {
    title?: string;
};

/** App mark: sync arcs around a timesheet block. */
export function AppLogoMark({ title = 'Timesheet Sync', ...props }: LogoProps) {
    return (
        <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
            {...props}
        >
            {title ? <title>{title}</title> : null}
            <rect width="32" height="32" rx="8" fill="currentColor" />
            {/* Outer sync arcs */}
            <path
                d="M22.5 11.2a7.2 7.2 0 0 0-11.8.6"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path
                d="M9.5 10.2v3.2h3.2"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M9.5 20.8a7.2 7.2 0 0 0 11.8-.6"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path
                d="M22.5 21.8v-3.2h-3.2"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Timesheet hash in the centre */}
            <path
                d="M13 14.5h6M13 17.5h6M14.5 13v6M17.5 13v6"
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.95"
            />
        </svg>
    );
}

export function AppWordmark({
    className,
    compact = false,
}: {
    className?: string;
    compact?: boolean;
}) {
    return (
        <div className={className}>
            {!compact ? (
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                    Jira · Bitmap
                </p>
            ) : null}
            <p className="text-base font-semibold leading-tight tracking-tight text-foreground">
                Timesheet Sync
            </p>
        </div>
    );
}
