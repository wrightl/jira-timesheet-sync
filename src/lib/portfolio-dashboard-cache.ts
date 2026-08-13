import type { PortfolioResult, PortfolioRiskTier } from "@/lib/portfolio";
import { filterPortfolioResult } from "@/lib/portfolio";
import { isExcludedClientId } from "@/lib/excluded-clients";

export const PORTFOLIO_DASHBOARD_SELECTION_KEY =
  "portfolio-dashboard-selection";

export type PortfolioDashboardRiskFilter = "all" | PortfolioRiskTier;

export type PortfolioDashboardSnapshot = {
  data: PortfolioResult | null;
  clientFilter: string;
  riskFilter: PortfolioDashboardRiskFilter;
  ownerFilter: string;
};

type StoredSelection = {
  clientFilter: string;
  riskFilter: PortfolioDashboardRiskFilter;
  ownerFilter: string;
};

/**
 * Module-scoped client cache for the portfolio dashboard.
 * Survives App Router unmount when navigating away and back.
 * Selection is also mirrored to localStorage so it survives full reloads.
 */
const memory = {
  data: null as PortfolioResult | null,
  clientFilter: "all",
  riskFilter: "all" as PortfolioDashboardRiskFilter,
  ownerFilter: "",
};

let hydratedFromStorage = false;

export function isPortfolioDashboardRiskFilter(
  value: string | null | undefined,
): value is PortfolioDashboardRiskFilter {
  return (
    value === "all" ||
    value === "ok" ||
    value === "watch" ||
    value === "risk" ||
    value === "unavailable"
  );
}

function readStoredSelection(): StoredSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PORTFOLIO_DASHBOARD_SELECTION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const clientFilter =
      typeof record.clientFilter === "string" && record.clientFilter
        ? record.clientFilter
        : "all";
    const ownerFilter =
      typeof record.ownerFilter === "string" ? record.ownerFilter : "";
    const riskCandidate =
      typeof record.riskFilter === "string" ? record.riskFilter : null;
    const riskFilter = isPortfolioDashboardRiskFilter(riskCandidate)
      ? riskCandidate
      : "all";
    return { clientFilter, riskFilter, ownerFilter };
  } catch {
    return null;
  }
}

function writeStoredSelection(): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredSelection = {
      clientFilter: memory.clientFilter,
      riskFilter: memory.riskFilter,
      ownerFilter: memory.ownerFilter,
    };
    localStorage.setItem(
      PORTFOLIO_DASHBOARD_SELECTION_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // ignore quota / private-mode failures
  }
}

/**
 * Apply persisted selection into module memory.
 * Call from a client useEffect after mount — never during render — so SSR
 * HTML stays aligned with the first client paint.
 */
export function hydratePortfolioDashboardSelectionFromStorage(): StoredSelection | null {
  if (hydratedFromStorage) return null;
  hydratedFromStorage = true;
  const stored = readStoredSelection();
  if (!stored) return null;
  const clientFilter = isExcludedClientId(stored.clientFilter)
    ? "all"
    : stored.clientFilter;
  memory.clientFilter = clientFilter;
  memory.riskFilter = stored.riskFilter;
  memory.ownerFilter = stored.ownerFilter;
  if (clientFilter !== stored.clientFilter) {
    writeStoredSelection();
  }
  return { ...stored, clientFilter };
}

export function readPortfolioDashboardCache(): PortfolioDashboardSnapshot {
  const clientFilter = isExcludedClientId(memory.clientFilter)
    ? "all"
    : memory.clientFilter;
  return {
    data: memory.data ? filterPortfolioResult(memory.data, {}) : null,
    clientFilter,
    riskFilter: memory.riskFilter,
    ownerFilter: memory.ownerFilter,
  };
}

export function setPortfolioDashboardSelection(selection: {
  clientFilter?: string;
  riskFilter?: PortfolioDashboardRiskFilter;
  ownerFilter?: string;
}): void {
  if (selection.clientFilter !== undefined) {
    memory.clientFilter = isExcludedClientId(selection.clientFilter)
      ? "all"
      : selection.clientFilter;
  }
  if (selection.riskFilter !== undefined) {
    memory.riskFilter = selection.riskFilter;
  }
  if (selection.ownerFilter !== undefined) {
    memory.ownerFilter = selection.ownerFilter;
  }
  writeStoredSelection();
}

export function getCachedPortfolio(): PortfolioResult | null {
  return memory.data ? filterPortfolioResult(memory.data, {}) : null;
}

export function setCachedPortfolio(data: PortfolioResult): void {
  memory.data = filterPortfolioResult(data, {});
}

export function invalidateCachedPortfolio(): void {
  memory.data = null;
}

/** Test helper: reset module memory and hydration flag. */
export function resetPortfolioDashboardCacheForTests(): void {
  memory.data = null;
  memory.clientFilter = "all";
  memory.riskFilter = "all";
  memory.ownerFilter = "";
  hydratedFromStorage = false;
}
