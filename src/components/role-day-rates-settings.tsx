"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ROLE_DAY_RATE_TITLES,
  formatMonthLabel,
  isEffectiveMonth,
  type RoleDayRateTitle,
  type ScheduleTiming,
} from "@/lib/role-day-rates";

type ScheduleRate = {
  roleName: RoleDayRateTitle;
  dayRateCost: number | null;
};

type Schedule = {
  id: string;
  effectiveMonth: string;
  timing: ScheduleTiming;
  rates: ScheduleRate[];
};

type ScheduleResponse = {
  titles: RoleDayRateTitle[];
  activeEffectiveMonth: string | null;
  schedules: Schedule[];
};

const TIMING_LABEL: Record<ScheduleTiming, string> = {
  active: "Active",
  scheduled: "Scheduled",
  past: "Past",
};

const TIMING_VARIANT: Record<
  ScheduleTiming,
  "ok" | "accent" | "muted"
> = {
  active: "ok",
  scheduled: "accent",
  past: "muted",
};

function moneyInput(value: number | null): string {
  return value != null && Number.isFinite(value) ? String(value) : "";
}

function emptyRates(): Record<string, string> {
  return Object.fromEntries(ROLE_DAY_RATE_TITLES.map((title) => [title, ""]));
}

function ratesFromSchedule(schedule: Schedule | undefined): Record<string, string> {
  const draft = emptyRates();
  for (const rate of schedule?.rates ?? []) {
    draft[rate.roleName] = moneyInput(rate.dayRateCost);
  }
  return draft;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

export function RoleDayRatesSettings() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [month, setMonth] = useState("");
  const [rateDraft, setRateDraft] = useState<Record<string, string>>(emptyRates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, startTransition] = useTransition();

  const seedAddForm = (rows: Schedule[]) => {
    const active = rows.find((row) => row.timing === "active") ?? rows[0];
    setEditingId(null);
    setMonth("");
    setRateDraft(ratesFromSchedule(active));
  };

  useEffect(() => {
    let cancelled = false;
    async function loadRates() {
      const res = await fetch("/api/role-day-rates");
      if (cancelled) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Failed to load role day rates");
        return;
      }
      const data = (await res.json()) as ScheduleResponse;
      const rows = data.schedules ?? [];
      setSchedules(rows);
      seedAddForm(rows);
    }
    void loadRates();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function parseRate(value: string): number | null {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return null;
    return amount;
  }

  function startEdit(schedule: Schedule) {
    setEditingId(schedule.id);
    setMonth(schedule.effectiveMonth);
    setRateDraft(ratesFromSchedule(schedule));
    setMessage(null);
    setError(null);
  }

  return (
    <Card>
      <CardTitle className="mb-2">Role day rates</CardTitle>
      <CardDescription className="mb-4">
        Internal cost of one 7.5-hour day, in GBP, for each job title. A rate
        set starts on the first day of the month you choose and stays in force
        until the next set starts. One set is active at a time. You can add
        sets for future months. Profitability uses the set that had started by
        the month the time was logged.
      </CardDescription>

      {schedules.length === 0 ? (
        <p className="mb-4 text-sm text-muted">
          No rate sets yet. Add the set that should apply from the start of a
          month.
        </p>
      ) : (
        <ul className="mb-6 space-y-4">
          {schedules.map((schedule) => (
            <li
              key={schedule.id}
              className="rounded-md border border-border p-3"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">
                  From 1 {formatMonthLabel(schedule.effectiveMonth)}
                </p>
                <Badge variant={TIMING_VARIANT[schedule.timing]}>
                  {TIMING_LABEL[schedule.timing]}
                </Badge>
                <div className="ml-auto flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => startEdit(schedule)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pending}
                    onClick={() => {
                      const label = formatMonthLabel(schedule.effectiveMonth);
                      if (
                        !window.confirm(
                          `Remove the rate set starting 1 ${label}?`,
                        )
                      ) {
                        return;
                      }
                      startTransition(async () => {
                        setMessage(null);
                        setError(null);
                        const res = await fetch(
                          `/api/role-day-rates/${schedule.id}`,
                          { method: "DELETE" },
                        );
                        const body = (await res.json().catch(() => null)) as {
                          error?: string;
                        } | null;
                        if (!res.ok) {
                          setError(body?.error ?? "Delete failed");
                          return;
                        }
                        setMessage(`Removed the ${label} rate set`);
                        if (editingId === schedule.id) seedAddForm([]);
                        setReloadKey((key) => key + 1);
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {schedule.rates.map((rate) => (
                  <div
                    key={rate.roleName}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <dt className="text-muted">{rate.roleName}</dt>
                    <dd>
                      {rate.dayRateCost == null
                        ? "—"
                        : formatMoney(rate.dayRateCost)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const amounts = ROLE_DAY_RATE_TITLES.map((roleName) => {
            const amount = parseRate(rateDraft[roleName] ?? "");
            return amount == null ? null : { roleName, dayRateCost: amount };
          });
          if (!isEffectiveMonth(month) || amounts.some((amount) => amount == null)) {
            setError(
              "Choose a month and enter a day rate of zero or more for every job title",
            );
            return;
          }
          const rates = amounts.flatMap((amount) => (amount ? [amount] : []));
          startTransition(async () => {
            setMessage(null);
            setError(null);
            const res = await fetch(
              editingId
                ? `/api/role-day-rates/${editingId}`
                : "/api/role-day-rates",
              {
                method: editingId ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ effectiveMonth: month, rates }),
              },
            );
            const body = (await res.json().catch(() => null)) as {
              error?: string;
              effectiveMonth?: string;
            } | null;
            if (!res.ok) {
              setError(body?.error ?? "Save failed");
              return;
            }
            const label = formatMonthLabel(body?.effectiveMonth ?? month);
            setMessage(
              editingId
                ? `Saved the ${label} rate set`
                : `Added the ${label} rate set`,
            );
            setReloadKey((key) => key + 1);
          });
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm font-medium">
            {editingId ? "Edit rate set" : "Add a rate set"}
          </p>
          {editingId ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                seedAddForm(schedules);
                setMessage(null);
                setError(null);
              }}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
        <div className="max-w-xs">
          <Label htmlFor="role-rate-month">Starts</Label>
          <Input
            id="role-rate-month"
            aria-label="Month the rate set starts"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLE_DAY_RATE_TITLES.map((title) => (
            <div key={title}>
              <Label htmlFor={`role-rate-${title.replace(/\s+/g, "-").toLowerCase()}`}>
                {title}
              </Label>
              <Input
                id={`role-rate-${title.replace(/\s+/g, "-").toLowerCase()}`}
                aria-label={`Day rate for ${title}`}
                inputMode="decimal"
                value={rateDraft[title] ?? ""}
                onChange={(event) =>
                  setRateDraft((current) => ({
                    ...current,
                    [title]: event.target.value,
                  }))
                }
                placeholder="0"
                required
              />
            </div>
          ))}
        </div>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : editingId
              ? "Save rate set"
              : "Add rate set"}
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
