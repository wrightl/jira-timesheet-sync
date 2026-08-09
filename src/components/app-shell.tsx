'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    useTransition,
    type ReactNode,
    type SVGProps,
} from 'react';
import { AppLogoMark, AppWordmark } from '@/components/app-logo';

type NavUser = {
    email: string;
    role: 'admin' | 'user';
};

const SIDEBAR_COLLAPSED_KEY = 'app-sidebar-collapsed';

type IconProps = SVGProps<SVGSVGElement>;

function IconHome(props: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            {...props}
        >
            <path
                d="M3 10.5 12 3l9 7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M5 9.5V20h14V9.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function IconMap(props: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            {...props}
        >
            <path
                d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"
                strokeLinejoin="round"
            />
            <path d="M9 4v14M15 6v14" strokeLinecap="round" />
        </svg>
    );
}

function IconProjects(props: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            {...props}
        >
            <path
                d="M4 19V5a1 1 0 0 1 1-1h6l2 2h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"
                strokeLinejoin="round"
            />
            <path d="M8 11h8M8 15h5" strokeLinecap="round" />
        </svg>
    );
}

function IconSync(props: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            {...props}
        >
            <path
                d="M21 12a9 9 0 0 0-15.5-6.3M3 4v4h4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M3 12a9 9 0 0 0 15.5 6.3M21 20v-4h-4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function IconLayers(props: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            {...props}
        >
            <path d="m12 3 9 5-9 5-9-5 9-5Z" strokeLinejoin="round" />
            <path d="m3 12 9 5 9-5M3 16l9 5 9-5" strokeLinejoin="round" />
        </svg>
    );
}

function IconUsers(props: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            {...props}
        >
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 19a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M16 19a5 5 0 0 1 5.5-4.9" strokeLinecap="round" />
        </svg>
    );
}

function IconCache(props: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            {...props}
        >
            <ellipse cx="12" cy="6" rx="7" ry="3" />
            <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
            <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        </svg>
    );
}

function IconSettings(props: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            {...props}
        >
            <circle cx="12" cy="12" r="3" />
            <path
                d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function IconPanelLeft(props: IconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            {...props}
        >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
        </svg>
    );
}

function userInitials(email: string): string {
    const local = email.split('@')[0] ?? '';
    const parts = local.split(/[._\-+]/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
    }
    return local.slice(0, 2).toUpperCase() || '?';
}

type NavLink = {
    href: string;
    label: string;
    icon: (props: IconProps) => ReactNode;
};

export function AppShell({
    currentPath,
    user,
    children,
}: {
    currentPath: string;
    user?: NavUser | null;
    children: ReactNode;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        try {
            return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
        } catch {
            return false;
        }
    });
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
    const menuId = useId();
    const signedIn = Boolean(user);

    const toggleCollapsed = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
            } catch {
                // ignore
            }
            return next;
        });
    }, []);

    useEffect(() => {
        if (!profileOpen) return;

        function onPointerDown(event: MouseEvent) {
            if (
                profileRef.current &&
                !profileRef.current.contains(event.target as Node)
            ) {
                setProfileOpen(false);
            }
        }

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') setProfileOpen(false);
        }

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [profileOpen]);

    const links: NavLink[] = [
        { href: '/', label: 'Dashboard', icon: IconHome },
        { href: '/projects', label: 'Projects', icon: IconProjects },
        { href: '/my-mappings', label: 'My mappings', icon: IconMap },
        ...(user?.role === 'admin'
            ? [
                  { href: '/syncs', label: 'Syncs', icon: IconSync },
                  { href: '/mappings', label: 'Mappings', icon: IconLayers },
                  { href: '/users', label: 'Users', icon: IconUsers },
                  { href: '/cache', label: 'Cache', icon: IconCache },
                  { href: '/settings', label: 'Settings', icon: IconSettings },
              ]
            : []),
    ];

    function signOut() {
        startTransition(async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            setProfileOpen(false);
            router.push('/login');
            router.refresh();
        });
    }

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm">
                <div className="flex h-14 items-center justify-between gap-4 px-4">
                    <div className="flex min-w-0 items-center gap-3">
                        {signedIn ? (
                            <button
                                type="button"
                                onClick={toggleCollapsed}
                                className="rounded-md p-2 text-muted transition-colors hover:bg-background hover:text-foreground"
                                aria-label={
                                    collapsed
                                        ? 'Expand sidebar'
                                        : 'Collapse sidebar'
                                }
                                title={
                                    collapsed
                                        ? 'Expand sidebar'
                                        : 'Collapse sidebar'
                                }
                            >
                                <IconPanelLeft className="h-4 w-4" />
                            </button>
                        ) : null}

                        <Link
                            href={signedIn ? '/' : '/login'}
                            className="flex min-w-0 items-center gap-2.5"
                        >
                            <AppLogoMark className="h-8 w-8 shrink-0 text-accent" />
                            <AppWordmark className="min-w-0" />
                        </Link>
                    </div>

                    <div className="relative shrink-0" ref={profileRef}>
                        {signedIn && user ? (
                            <>
                                <button
                                    type="button"
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white transition hover:opacity-90"
                                    aria-expanded={profileOpen}
                                    aria-haspopup="menu"
                                    aria-controls={menuId}
                                    aria-label="Account menu"
                                    onClick={() =>
                                        setProfileOpen((open) => !open)
                                    }
                                >
                                    {userInitials(user.email)}
                                </button>
                                {profileOpen ? (
                                    <div
                                        id={menuId}
                                        role="menu"
                                        className="absolute right-0 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-card py-1"
                                    >
                                        <div className="border-b border-border px-3 py-2.5">
                                            <p className="text-xs text-muted">
                                                Signed in as
                                            </p>
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {user.email}
                                            </p>
                                            <p className="mt-0.5 text-xs capitalize text-muted">
                                                {user.role}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            disabled={pending}
                                            className="block w-full px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-background disabled:opacity-60"
                                            onClick={signOut}
                                        >
                                            Sign out
                                        </button>
                                    </div>
                                ) : null}
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm text-muted transition-colors hover:bg-background hover:text-foreground"
                            >
                                Sign in
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex min-h-0 flex-1">
                {signedIn ? (
                    <aside
                        className={`shrink-0 overflow-hidden border-r border-border bg-card transition-[width] duration-200 ease-in-out ${
                            collapsed ? 'w-[3.75rem]' : 'w-56'
                        }`}
                        aria-label="Main navigation"
                    >
                        <nav className="flex flex-col gap-0.5 p-2 pt-3">
                            {links.map((link) => {
                                const active = currentPath === link.href;
                                const Icon = link.icon;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        title={link.label}
                                        aria-label={link.label}
                                        aria-current={
                                            active ? 'page' : undefined
                                        }
                                        className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors ${
                                            active
                                                ? 'bg-accent-muted font-medium text-accent'
                                                : 'text-muted hover:bg-background hover:text-foreground'
                                        }`}
                                    >
                                        <Icon
                                            className={`h-4 w-4 shrink-0 ${
                                                active ? 'text-accent' : ''
                                            }`}
                                        />
                                        <span className="truncate">
                                            {link.label}
                                        </span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </aside>
                ) : null}

                <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
}
