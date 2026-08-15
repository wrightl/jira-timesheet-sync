import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import {
  formatGithubTokenExpiryLabel,
  githubTokenExpiryWarning,
} from "@/lib/github-token-expiry";

export function GithubTokenExpiryAlert({
  tokenExpiresAt,
  linkToSettings = false,
}: {
  tokenExpiresAt: string | null;
  linkToSettings?: boolean;
}) {
  const warning = githubTokenExpiryWarning(tokenExpiresAt);
  if (warning === "none") return null;

  const label = formatGithubTokenExpiryLabel(tokenExpiresAt);
  const prefix =
    warning === "expired"
      ? "Your GitHub personal access token has expired."
      : "Your GitHub personal access token expires soon.";

  return (
    <Alert variant="error">
      {prefix} {label}.{" "}
      {linkToSettings ? (
        <Link href="/settings" className="underline underline-offset-2">
          Update it in Settings
        </Link>
      ) : (
        "Paste a new token below to keep the GitHub dashboard working."
      )}
    </Alert>
  );
}
