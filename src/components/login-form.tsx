"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="rounded-lg border border-border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error ?? "Login failed");
            return;
          }
          router.push("/");
          router.refresh();
        });
      }}
    >
      <h2 className="mb-1 text-xl font-semibold">Sign in</h2>
      <p className="mb-4 text-sm text-muted">
        Use your email address and password.
      </p>
      <label className="mb-3 block text-sm">
        <span className="mb-1 block text-muted">Email</span>
        <input
          type="email"
          autoComplete="email"
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label className="mb-4 block text-sm">
        <span className="mb-1 block text-muted">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2 text-white hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="mt-4 text-center text-sm text-muted">
        No account?{" "}
        <Link href="/register" className="text-accent hover:underline">
          Register
        </Link>
      </p>
    </form>
  );
}
