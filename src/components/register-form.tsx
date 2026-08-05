"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppLogoMark } from "@/components/app-logo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="w-full max-w-[400px] p-7">
      <form
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
        <div className="mb-6 flex flex-col items-center text-center">
          <AppLogoMark className="mb-3 h-12 w-12 text-accent" />
          <h1 className="text-xl font-semibold tracking-tight">
            Create account
          </h1>
          <p className="mt-1 text-sm text-muted">
            Register with your work email. New accounts are regular users.
          </p>
        </div>
        <Field label="Email" htmlFor="register-email">
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field
          label="Password (min 8 characters)"
          htmlFor="register-password"
          className="mb-4"
        >
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error ? (
          <Alert variant="error" className="mb-3">
            {error}
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Register"}
        </Button>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </Card>
  );
}
