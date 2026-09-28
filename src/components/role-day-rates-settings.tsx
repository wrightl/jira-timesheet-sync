"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type RoleDayRate = {
  id: string;
  roleName: string;
  dayRateCost: number;
};

type RoleDayRateResponse = {
  rates: RoleDayRate[];
  knownJobTitles: string[];
};

type Draft = {
  roleName: string;
  dayRateCost: string;
};

const JOB_TITLE_LIST_ID = "role-day-rate-job-titles";

function moneyInput(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

export function RoleDayRatesSettings() {
  const [rates, setRates] = useState<RoleDayRate[]>([]);
  const [knownJobTitles, setKnownJobTitles] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [roleName, setRoleName] = useState("");
  const [dayRateCost, setDayRateCost] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/role-day-rates");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Failed to load role day rates");
        return;
      }
      const data = (await res.json()) as RoleDayRateResponse;
      setRates(data.rates ?? []);
      setKnownJobTitles(data.knownJobTitles ?? []);
      setDrafts(
        Object.fromEntries(
          (data.rates ?? []).map((rate) => [
            rate.id,
            {
              roleName: rate.roleName,
              dayRateCost: moneyInput(rate.dayRateCost),
            },
          ]),
        ),
      );
    });
  };

  useEffect(() => {
    load();
  }, []);

  function parseRate(value: string): number | null {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return null;
    return amount;
  }

  return (
    <Card>
      <CardTitle className="mb-2">Role day rates</CardTitle>
      <CardDescription className="mb-4">
        Internal cost of one 7.5-hour day for a job role, in GBP. Profitability
        matches these names to Bitmap job titles, then to the job title on a
        user mapping. Senior Engineer and Project Manager are typical roles.
      </CardDescription>

      <datalist id={JOB_TITLE_LIST_ID}>
        {knownJobTitles.map((title) => (
          <option key={title} value={title} />
        ))}
      </datalist>

      {rates.length === 0 ? (
        <p className="mb-4 text-sm text-muted">
          No role rates yet. Add one for each job title you want costed.
        </p>
      ) : (
        <ul className="mb-4 space-y-3">
          {rates.map((rate) => {
            const draft = drafts[rate.id] ?? {
              roleName: rate.roleName,
              dayRateCost: moneyInput(rate.dayRateCost),
            };
            return (
              <li
                key={rate.id}
                className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(8rem,0.6fr)_auto_auto]"
              >
                <Input
                  aria-label={`Role name for ${rate.roleName}`}
                  value={draft.roleName}
                  list={JOB_TITLE_LIST_ID}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [rate.id]: {
                        ...draft,
                        roleName: event.target.value,
                      },
                    }))
                  }
                />
                <Input
                  aria-label={`Day rate for ${rate.roleName}`}
                  inputMode="decimal"
                  value={draft.dayRateCost}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [rate.id]: {
                        ...draft,
                        dayRateCost: event.target.value,
                      },
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    const amount = parseRate(draft.dayRateCost);
                    if (!draft.roleName.trim() || amount == null) {
                      setError("Enter a role name and a day rate of zero or more");
                      return;
                    }
                    startTransition(async () => {
                      setMessage(null);
                      setError(null);
                      const res = await fetch(`/api/role-day-rates/${rate.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          roleName: draft.roleName.trim(),
                          dayRateCost: amount,
                        }),
                      });
                      const body = (await res.json().catch(() => null)) as {
                        error?: string;
                      } | null;
                      if (!res.ok) {
                        setError(body?.error ?? "Save failed");
                        return;
                      }
                      setMessage(`Saved ${draft.roleName.trim()}`);
                      load();
                    });
                  }}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Remove the ${rate.roleName} day rate?`)) {
                      return;
                    }
                    startTransition(async () => {
                      setMessage(null);
                      setError(null);
                      const res = await fetch(`/api/role-day-rates/${rate.id}`, {
                        method: "DELETE",
                      });
                      const body = (await res.json().catch(() => null)) as {
                        error?: string;
                      } | null;
                      if (!res.ok) {
                        setError(body?.error ?? "Delete failed");
                        return;
                      }
                      setMessage(`Removed ${rate.roleName}`);
                      load();
                    });
                  }}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(8rem,0.6fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const amount = parseRate(dayRateCost);
          if (!roleName.trim() || amount == null) {
            setError("Enter a role name and a day rate of zero or more");
            return;
          }
          startTransition(async () => {
            setMessage(null);
            setError(null);
            const res = await fetch("/api/role-day-rates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roleName: roleName.trim(),
                dayRateCost: amount,
              }),
            });
            const body = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (!res.ok) {
              setError(body?.error ?? "Save failed");
              return;
            }
            setRoleName("");
            setDayRateCost("");
            setMessage("Role day rate added");
            load();
          });
        }}
      >
        <Input
          aria-label="New role name"
          value={roleName}
          list={JOB_TITLE_LIST_ID}
          onChange={(event) => setRoleName(event.target.value)}
          placeholder="Senior Engineer"
          required
        />
        <Input
          aria-label="New role day rate"
          inputMode="decimal"
          value={dayRateCost}
          onChange={(event) => setDayRateCost(event.target.value)}
          placeholder="450"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add rate"}
        </Button>
      </form>

      {message ? (
        <Alert variant="success" className="mt-3">
          {message}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="error" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </Card>
  );
}
