import { HOURS_PER_WORKING_DAY } from "@/lib/working-duration";

/** Projects whose profitability percentage is under this value are flagged. */
export const LOW_PROFITABILITY_PCT = 20;

/** Cap detail fetches so a wide close window stays bounded. */
export const PROFITABILITY_PROJECT_CAP = 60;

const MAX_RANGE_DAYS = 366 * 5;

export type RoleRate = {
  roleName: string;
  dayRateCost: number;
};

export type ProfitabilityBudget = {
  id: string;
  dayRate: number | null;
  billableDefault: boolean;
  weightHours: number | null;
};

export type ProfitabilityEntry = {
  hours: number;
  /** True when the client was charged for the time. */
  billable: boolean | null;
  state: string | null;
  jobTitle: string | null;
  projectBudgetId: string | null;
  budgetDayRate: number | null;
};

export type ClosedProjectInput = {
  projectId: string;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  endDate: string;
  entries: ProfitabilityEntry[];
  budgets: ProfitabilityBudget[];
  roleRates: RoleRate[];
  loadError?: string | null;
};

export type ProjectProfitability = {
  projectId: string;
  projectName: string | null;
  clientId: string | null;
  clientName: string | null;
  endDate: string;
  hours: number;
  billableHours: number;
  charged: number;
  cost: number;
  profitabilityPct: number | null;
  belowThreshold: boolean;
  unratedHours: number;
  unpricedHours: number;
  blendedClientRate: boolean;
  missingRoles: string[];
  loadError: string | null;
};

export type ProfitabilitySummary = {
  projectCount: number;
  ratedProjectCount: number;
  averageProfitabilityPct: number | null;
  medianProfitabilityPct: number | null;
  overallProfitabilityPct: number | null;
  belowThresholdCount: number;
  totalCharged: number;
  totalCost: number;
  grossProfit: number;
  incompleteCount: number;
};

export class ProfitabilityQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfitabilityQueryError";
  }
}

export function normaliseRoleKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isoDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match?.[1] ?? null;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function assertProfitabilityDateRange(
  startDate: string,
  endDate: string,
): void {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    throw new ProfitabilityQueryError(
      "startDate and endDate must be YYYY-MM-DD dates",
    );
  }
  if (startDate > endDate) {
    throw new ProfitabilityQueryError("startDate must be on or before endDate");
  }
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  const days = Math.round((end - start) / 86_400_000);
  if (days > MAX_RANGE_DAYS) {
    throw new ProfitabilityQueryError("Date range cannot exceed 5 years");
  }
}

export function isCountableProfitabilityEntry(
  state: string | null | undefined,
): boolean {
  const value = state?.toLowerCase() ?? "";
  return value !== "planned" && value !== "rejected";
}

/** Bitmap may send a boolean or a JSON string. */
export function profitabilityBillableFlag(billable: unknown): boolean | null {
  if (billable === true || billable === 1 || billable === "true") return true;
  if (billable === false || billable === 0 || billable === "false") {
    return false;
  }
  return null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function positiveRate(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function roleRateMap(rates: RoleRate[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const rate of rates) {
    const key = normaliseRoleKey(rate.roleName);
    if (!key) continue;
    const amount = positiveRate(rate.dayRateCost);
    if (amount == null) continue;
    map.set(key, amount);
  }
  return map;
}

/**
 * Client day rate for a timesheet line.
 * Prefer the entry's budget, then a single project rate or the billable
 * default, then a hours-weighted blend when budgets disagree.
 */
export function resolveClientDayRate(
  budgets: ProfitabilityBudget[],
  entry: Pick<
    ProfitabilityEntry,
    "projectBudgetId" | "budgetDayRate" | "billable"
  >,
): { rate: number | null; blended: boolean } {
  if (entry.billable !== true) return { rate: null, blended: false };

  if (entry.projectBudgetId) {
    const match = budgets.find((budget) => budget.id === entry.projectBudgetId);
    const rate = positiveRate(match?.dayRate);
    if (rate != null) return { rate, blended: false };
  }

  const direct = positiveRate(entry.budgetDayRate);
  if (direct != null) return { rate: direct, blended: false };

  const priced = budgets.filter((budget) => positiveRate(budget.dayRate) != null);
  if (priced.length === 0) return { rate: null, blended: false };

  const unique = [
    ...new Set(priced.map((budget) => positiveRate(budget.dayRate)!)),
  ];
  if (unique.length === 1) return { rate: unique[0]!, blended: false };

  const fallback = priced.find((budget) => budget.billableDefault);
  const fallbackRate = positiveRate(fallback?.dayRate);
  if (fallbackRate != null) return { rate: fallbackRate, blended: false };

  let weight = 0;
  let sum = 0;
  for (const budget of priced) {
    const hours =
      budget.weightHours != null && budget.weightHours > 0
        ? budget.weightHours
        : 1;
    sum += positiveRate(budget.dayRate)! * hours;
    weight += hours;
  }
  if (weight <= 0) return { rate: null, blended: false };
  return { rate: sum / weight, blended: true };
}

export function profitabilityPct(
  charged: number,
  cost: number,
): number | null {
  if (!(cost > 0) || !Number.isFinite(charged) || !Number.isFinite(cost)) {
    return null;
  }
  return round1((charged / cost) * 100);
}

/**
 * Profitability for one closed project.
 * Charged = billable days × client day rate.
 * Cost = countable days × the person's role cost day rate.
 * Profitability % = charged ÷ cost × 100.
 * Lines missing a role rate or a client rate are omitted from both sides.
 */
export function scoreClosedProject(
  input: ClosedProjectInput,
): ProjectProfitability {
  const rates = roleRateMap(input.roleRates);
  let hours = 0;
  let billableHours = 0;
  let charged = 0;
  let cost = 0;
  let unratedHours = 0;
  let unpricedHours = 0;
  let blendedClientRate = false;
  const missingRoles = new Set<string>();

  if (!input.loadError) {
    for (const entry of input.entries) {
      if (!isCountableProfitabilityEntry(entry.state)) continue;
      if (!Number.isFinite(entry.hours) || entry.hours <= 0) continue;

      const roleKey = entry.jobTitle ? normaliseRoleKey(entry.jobTitle) : "";
      const roleRate = roleKey ? rates.get(roleKey) : undefined;
      if (roleRate == null) {
        unratedHours += entry.hours;
        missingRoles.add(entry.jobTitle?.trim() || "Unknown role");
        continue;
      }

      if (entry.billable !== true && entry.billable !== false) continue;

      const days = entry.hours / HOURS_PER_WORKING_DAY;
      if (entry.billable === true) {
        const client = resolveClientDayRate(input.budgets, entry);
        if (client.rate == null) {
          unpricedHours += entry.hours;
          continue;
        }
        if (client.blended) blendedClientRate = true;
        charged += days * client.rate;
        billableHours += entry.hours;
      }

      cost += days * roleRate;
      hours += entry.hours;
    }
  }

  const chargedRounded = round2(charged);
  const costRounded = round2(cost);
  const pct = profitabilityPct(chargedRounded, costRounded);

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    clientId: input.clientId,
    clientName: input.clientName,
    endDate: input.endDate,
    hours: round1(hours),
    billableHours: round1(billableHours),
    charged: chargedRounded,
    cost: costRounded,
    profitabilityPct: pct,
    belowThreshold: pct != null && pct < LOW_PROFITABILITY_PCT,
    unratedHours: round1(unratedHours),
    unpricedHours: round1(unpricedHours),
    blendedClientRate,
    missingRoles: [...missingRoles].sort((a, b) => a.localeCompare(b)),
    loadError: input.loadError ?? null,
  };
}

export function medianProfitability(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return round1((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return round1(sorted[mid]!);
}

export function summariseProfitability(
  projects: ProjectProfitability[],
): ProfitabilitySummary {
  const rated = projects.filter((project) => project.profitabilityPct != null);
  const percentages = rated.map((project) => project.profitabilityPct!);
  const average =
    percentages.length === 0
      ? null
      : round1(
          percentages.reduce((sum, value) => sum + value, 0) /
            percentages.length,
        );

  let totalCharged = 0;
  let totalCost = 0;
  for (const project of projects) {
    if (project.loadError) continue;
    totalCharged += project.charged;
    totalCost += project.cost;
  }
  totalCharged = round2(totalCharged);
  totalCost = round2(totalCost);

  return {
    projectCount: projects.length,
    ratedProjectCount: rated.length,
    averageProfitabilityPct: average,
    medianProfitabilityPct: medianProfitability(percentages),
    overallProfitabilityPct: profitabilityPct(totalCharged, totalCost),
    belowThresholdCount: projects.filter((project) => project.belowThreshold)
      .length,
    totalCharged,
    totalCost,
    grossProfit: round2(totalCharged - totalCost),
    incompleteCount: projects.filter(
      (project) =>
        project.loadError != null ||
        project.unratedHours > 0 ||
        project.unpricedHours > 0,
    ).length,
  };
}

export function compareProjectProfitability(
  a: ProjectProfitability,
  b: ProjectProfitability,
): number {
  if (a.profitabilityPct == null && b.profitabilityPct == null) {
    return (a.projectName ?? "").localeCompare(b.projectName ?? "");
  }
  if (a.profitabilityPct == null) return 1;
  if (b.profitabilityPct == null) return -1;
  if (a.profitabilityPct !== b.profitabilityPct) {
    return a.profitabilityPct - b.profitabilityPct;
  }
  return (a.projectName ?? "").localeCompare(b.projectName ?? "");
}
