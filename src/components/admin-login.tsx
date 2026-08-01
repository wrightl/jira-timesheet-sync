"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAdminSession, clearAdminSession } from "@/app/actions/auth";

export function AdminLogin({ initiallyAuthed }: { initiallyAuthed: boolean }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (initiallyAuthed) {
    return (
      <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span className="text-ok">Admin session active</span>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-muted hover:text-foreground"
          onClick={() =>
            startTransition(async () => {
              await clearAdminSession();
              router.refresh();
            })
          }
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form
      className="mb-6 rounded-lg border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setAdminSession(apiKey);
          if (!result.ok) {
            setError(result.error ?? "Login failed");
            return;
          }
          setApiKey("");
          router.refresh();
        });
      }}
    >
      <p className="mb-3 text-sm text-muted">
        Enter the admin API key to manage mappings and settings.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="ADMIN_API_KEY"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2"
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </form>
  );
}
