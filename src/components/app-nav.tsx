import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/mappings", label: "Mappings" },
  { href: "/settings", label: "Settings" },
];

export function AppNav({ currentPath }: { currentPath: string }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Integration
          </p>
          <h1 className="text-lg font-semibold text-foreground">
            Jira Timesheet Sync
          </h1>
        </div>
        <nav className="flex gap-1">
          {links.map((link) => {
            const active = currentPath === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm ${
                  active
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
