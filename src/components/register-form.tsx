"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RegisterForm() {
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
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error ?? "Registration failed");
            return;
          }
          router.push("/my-mappings");
          router.refresh();
        });
      }}
    >
      <h2 className="mb-1 text-xl font-semibold">Create account</h2>
      <p className="mb-4 text-sm text-muted">
        Register with your work email. New accounts are regular users.
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
        <span className="mb-1 block text-muted">Password (min 8 characters)</span>
        <input
          type="password"
          autoComplete="new-password"
          minLength={8}
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
        {pending ? "Creating…" : "Register"}
      </button>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
