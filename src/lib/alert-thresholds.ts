export type AlertThresholds = {
  budgetBurnPctRisk: number;
  runwayDaysRisk: number;
  agingWipRisk: number;
  openBugsRisk: number;
  syncFailedOpenRisk: number;
  estimateCoveragePctWatch: number;
  scheduleSlipDaysRisk: number;
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  budgetBurnPctRisk: 90,
  runwayDaysRisk: 5,
  agingWipRisk: 10,
  openBugsRisk: 10,
  syncFailedOpenRisk: 5,
  estimateCoveragePctWatch: 70,
  scheduleSlipDaysRisk: 7,
};

export function parseAlertThresholds(
  raw: string | null | undefined,
): AlertThresholds {
  if (!raw?.trim()) return { ...DEFAULT_ALERT_THRESHOLDS };
  try {
    const parsed = JSON.parse(raw) as Partial<AlertThresholds>;
    return {
      budgetBurnPctRisk:
        typeof parsed.budgetBurnPctRisk === "number"
          ? parsed.budgetBurnPctRisk
          : DEFAULT_ALERT_THRESHOLDS.budgetBurnPctRisk,
      runwayDaysRisk:
        typeof parsed.runwayDaysRisk === "number"
          ? parsed.runwayDaysRisk
          : DEFAULT_ALERT_THRESHOLDS.runwayDaysRisk,
      agingWipRisk:
        typeof parsed.agingWipRisk === "number"
          ? parsed.agingWipRisk
          : DEFAULT_ALERT_THRESHOLDS.agingWipRisk,
      openBugsRisk:
        typeof parsed.openBugsRisk === "number"
          ? parsed.openBugsRisk
          : DEFAULT_ALERT_THRESHOLDS.openBugsRisk,
      syncFailedOpenRisk:
        typeof parsed.syncFailedOpenRisk === "number"
          ? parsed.syncFailedOpenRisk
          : DEFAULT_ALERT_THRESHOLDS.syncFailedOpenRisk,
      estimateCoveragePctWatch:
        typeof parsed.estimateCoveragePctWatch === "number"
          ? parsed.estimateCoveragePctWatch
          : DEFAULT_ALERT_THRESHOLDS.estimateCoveragePctWatch,
      scheduleSlipDaysRisk:
        typeof parsed.scheduleSlipDaysRisk === "number"
          ? parsed.scheduleSlipDaysRisk
          : DEFAULT_ALERT_THRESHOLDS.scheduleSlipDaysRisk,
    };
  } catch {
    return { ...DEFAULT_ALERT_THRESHOLDS };
  }
}
