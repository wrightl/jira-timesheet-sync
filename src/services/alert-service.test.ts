import { describe, expect, it, vi } from "vitest";
import { AlertService } from "@/services/alert-service";
import type { PortfolioService } from "@/services/portfolio-service";
import type { SettingsService } from "@/services/settings-service";
import type { SettingsRepository } from "@/repositories/settings-repository";
import { DEFAULT_ALERT_THRESHOLDS } from "@/lib/alert-thresholds";

describe("AlertService.evaluate", () => {
  it("builds risk alerts from portfolio and sync failures", async () => {
    const settingsRepo = {
      getDefault: async () => ({
        id: "default",
        slackWebhookUrlEncrypted: null,
        alertEmail: null,
        alertThresholdsJson: null,
      }),
    } as unknown as SettingsRepository;

    const settings = {} as SettingsService;
    const portfolio = {
      getPortfolio: async () => ({
        generatedAt: "2026-08-12T00:00:00.000Z",
        summary: {
          projectCount: 1,
          riskCount: 1,
          watchCount: 0,
          okCount: 0,
          avgBudgetBurnPct: 95,
        },
        projects: [
          {
            projectId: "p1",
            projectName: "Alpha",
            projectKey: "ALP",
            clientId: "c1",
            clientName: "Acme",
            ownerName: "Lee",
            state: "active",
            budgetBurnPct: 95,
            billableRemainingHours: 2,
            runwayDays: 2,
            scheduleSlipDays: 8,
            unhealthyChecks: 0,
            healthy: true,
            riskTier: "risk" as const,
            riskReasons: ["Budget burn 95%", "Runway 2d"],
          },
        ],
        syncFailedOpen: 8,
        error: null,
      }),
    } as unknown as PortfolioService;

    const fetchImpl = vi.fn();
    const service = new AlertService(
      settingsRepo,
      settings,
      portfolio,
      fetchImpl as unknown as typeof fetch,
    );

    const result = await service.evaluate({ deliver: false });
    expect(result.alerts.length).toBeGreaterThanOrEqual(2);
    expect(result.alerts.some((a) => a.title.includes("Sync"))).toBe(true);
    expect(result.alerts.some((a) => a.title === "Alpha")).toBe(true);
    expect(result.slackDelivered).toBe(false);
    expect(result.digestText).toContain("Engineering risk alerts");
    expect(DEFAULT_ALERT_THRESHOLDS.budgetBurnPctRisk).toBe(90);
  });
});
