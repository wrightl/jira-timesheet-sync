import { cn } from "@/lib/cn";
import { jiraIssueBrowseUrl } from "@/lib/jira-issue-url";

export function JiraIssueLink({
  issueKey,
  baseUrl,
  className,
}: {
  issueKey: string | null | undefined;
  baseUrl?: string | null;
  className?: string;
}) {
  const key = issueKey?.trim();
  if (!key) {
    return <span className={cn("font-mono text-xs", className)}>—</span>;
  }

  const href = jiraIssueBrowseUrl(baseUrl, key);
  if (!href) {
    return (
      <span className={cn("font-mono text-xs", className)}>{key}</span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "font-mono text-xs font-medium text-accent underline underline-offset-2 hover:text-accent-hover",
        className,
      )}
    >
      {key}
    </a>
  );
}
