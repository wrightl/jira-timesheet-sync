import type {
  BitmapBurndown,
  BitmapProject,
  BitmapTimesheetEntry,
} from "@/clients/bitmap-http";
import { DEFAULT_ALERT_THRESHOLDS } from "@/lib/alert-thresholds";

export const BUDGET_BURN_WATCH_PCT = 85;
export const RUNWAY_FALLBACK_HOURS_PER_DAY = 6;
export const RECENT_BURN_WINDOW_DAYS = 14;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function pct(
  numer: number | null | undefined,
  denom: number | null | undefined,
): number | null {
  if (
    numer == null ||
    denom == null ||
    !Number.isFinite(numer) ||
    !Number.isFinite(denom) ||
    denom <= 0
  ) {
    return null;
  }
  return round1((numer / denom) * 100);
}

export type BitmapBurnProject = Pick<
  BitmapProject,
  | "time_budgeted"
  | "time_logged"
  | "time_remaining"
  | "billable_time_used"
  | "billable_time_remaining"
  | "start_date"
>;

/** Prefer billable hours used, then all time logged, over the project time budget. */
export function computeBudgetBurnPct(
  project: BitmapBurnProject,
): number | null {
  const budgeted = project.time_budgeted;
  if (budgeted == null || !Number.isFinite(budgeted) || budgeted <= 0) {
    return null;
  }
  const used = project.billable_time_used ?? project.time_logged;
  if (used == null || !Number.isFinite(used)) return null;
  return pct(used, budgeted);
}

export function billableRemainingHours(
  project: BitmapBurnProject,
): number | null {
  const remaining =
    project.billable_time_remaining ?? project.time_remaining ?? null;
  if (remaining == null || !Number.isFinite(remaining) || remaining < 0) {
    return null;
  }
  return remaining;
}

/** Bitmap burndown totals are seconds of remaining budget. */
function burndownTotalToHours(total: number): number {
  return total / 3600;
}

export function avgDailyBillableBurnHours(
  timesheets: BitmapTimesheetEntry[],
  burndown: BitmapBurndown | null,
  now: Date = new Date(),
): number | null {
  const windowMs = RECENT_BURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - windowMs;
  const byDay = new Map<string, number>();

  for (const entry of timesheets) {
    if (entry.billable === false) continue;
    const hours = typeof entry.hours === "number" ? entry.hours : 0;
    if (!Number.isFinite(hours) || hours <= 0) continue;
    const date = entry.date ? String(entry.date).slice(0, 10) : null;
    if (!date) continue;
    const t = Date.parse(date);
    if (!Number.isFinite(t) || t < cutoff) continue;
    byDay.set(date, (byDay.get(date) ?? 0) + hours);
  }

  if (byDay.size > 0) {
    let sum = 0;
    for (const h of byDay.values()) sum += h;
    return round2(sum / byDay.size);
  }

  const points = (burndown?.burndown ?? [])
    .map((p) => ({
      date: String(p.date).slice(0, 10),
      hours: burndownTotalToHours(Number(p.total)),
    }))
    .filter((p) => Number.isFinite(p.hours))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return null;
  const recent = points.slice(-RECENT_BURN_WINDOW_DAYS);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last) return null;
  const daySpan = Math.max(
    1,
    Math.round(
      (Date.parse(last.date) - Date.parse(first.date)) / (24 * 60 * 60 * 1000),
    ),
  );
  const burned = first.hours - last.hours;
  if (!Number.isFinite(burned) || burned <= 0) return null;
  return round2(burned / daySpan);
}

export function lifetimeDailyBurnHours(
  project: BitmapBurnProject,
  now: Date = new Date(),
): number | null {
  const logged = project.billable_time_used ?? project.time_logged ?? null;
  const start = project.start_date ? Date.parse(project.start_date) : NaN;
  if (logged == null || logged <= 0 || !Number.isFinite(start) || now.getTime() <= start) {
    return null;
  }
  const elapsedDays = Math.max(
    1,
    (now.getTime() - start) / (24 * 60 * 60 * 1000),
  );
  const daily = logged / elapsedDays;
  return daily > 0 ? daily : null;
}

/**
 * Remaining billable hours ÷ daily burn.
 * Daily burn prefers 14-day timesheets, then burndown slope, then lifetime
 * average since start, then 6 billable hours/day.
 */
export function estimateRunwayDays(options: {
  project: BitmapBurnProject;
  timesheets?: BitmapTimesheetEntry[];
  burndown?: BitmapBurndown | null;
  now?: Date;
}): number | null {
  const now = options.now ?? new Date();
  const remaining = billableRemainingHours(options.project);
  if (remaining == null) return null;

  const daily =
    avgDailyBillableBurnHours(
      options.timesheets ?? [],
      options.burndown ?? null,
      now,
    ) ?? lifetimeDailyBurnHours(options.project, now);

  if (daily != null && daily > 0) return round1(remaining / daily);
  return round1(remaining / RUNWAY_FALLBACK_HOURS_PER_DAY);
}

export function burndownRemainingSlipHours(
  burndown: BitmapBurndown | null,
  lookbackDays = 7,
): number | null {
  const points = (burndown?.burndown ?? [])
    .map((p) => ({
      date: String(p.date).slice(0, 10),
      hours: burndownTotalToHours(Number(p.total)),
    }))
    .filter((p) => Number.isFinite(p.hours))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  if (!latest) return null;
  const targetMs =
    Date.parse(latest.date) - lookbackDays * 24 * 60 * 60 * 1000;

  let prior = points[0];
  for (const point of points) {
    if (Date.parse(point.date) <= targetMs) prior = point;
  }
  if (!prior || prior.date === latest.date) return null;
  return round1(latest.hours - prior.hours);
}

export function burnStatus(
  burnPct: number | null,
  riskAt: number = DEFAULT_ALERT_THRESHOLDS.budgetBurnPctRisk,
): "ok" | "watch" | "risk" | "unavailable" {
  if (burnPct == null) return "unavailable";
  if (burnPct >= riskAt) return "risk";
  if (burnPct >= BUDGET_BURN_WATCH_PCT && BUDGET_BURN_WATCH_PCT < riskAt) {
    return "watch";
  }
  return "ok";
}

export function groupTimesheetsByProjectId(
  entries: BitmapTimesheetEntry[],
): Map<string, BitmapTimesheetEntry[]> {
  const byProject = new Map<string, BitmapTimesheetEntry[]>();
  for (const entry of entries) {
    const id = entry.project?.id;
    if (!id) continue;
    const list = byProject.get(id);
    if (list) list.push(entry);
    else byProject.set(id, [entry]);
  }
  return byProject;
}
