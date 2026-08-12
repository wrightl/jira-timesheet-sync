import { getDb, type Db } from "@/db";
import {
  createPortfolioService,
  type PortfolioService,
} from "@/services/portfolio-service";
import {
  createProjectDashboardService,
  type ProjectDashboardService,
} from "@/services/project-dashboard";
import {
  createSettingsService,
  type SettingsService,
} from "@/services/settings-service";

export type StatusNarrative = {
  projectId: string;
  title: string;
  generatedAt: string;
  markdown: string;
  plainText: string;
  highlights: string[];
  risks: string[];
};

function line(label: string, value: string): string {
  return `- **${label}:** ${value}`;
}

export class StatusNarrativeService {
  constructor(
    private readonly portfolio: PortfolioService,
    private readonly projects: ProjectDashboardService,
    private readonly settings: SettingsService,
  ) {}

  async buildForProject(projectId: string): Promise<StatusNarrative> {
    const id = projectId.trim();
    const [portfolio, dashboard] = await Promise.all([
      this.portfolio.getPortfolio(),
      this.projects.getDashboard(id),
    ]);

    const row = portfolio.projects.find((p) => p.projectId === id);
    const name =
      dashboard.project.name ??
      row?.projectName ??
      dashboard.project.key ??
      id;
    const client =
      dashboard.project.clientName ?? row?.clientName ?? "Unknown client";

    const highlights: string[] = [];
    const risks: string[] = [];

    const burn = dashboard.metrics.budgetBurnPct;
    if (burn.displayValue !== "—") {
      highlights.push(`Budget burn at ${burn.displayValue}`);
    }
    const runway = dashboard.metrics.runwayDays;
    if (runway.displayValue !== "—") {
      highlights.push(`Billable runway ${runway.displayValue}`);
    }
    const throughput = dashboard.metrics.throughput30d;
    if (throughput.value != null) {
      highlights.push(`Throughput (30d): ${throughput.displayValue}`);
    }

    if (row?.riskReasons?.length) {
      risks.push(...row.riskReasons);
    }
    for (const metric of [
      dashboard.metrics.budgetBurnPct,
      dashboard.metrics.runwayDays,
      dashboard.metrics.agingWipCount,
      dashboard.metrics.openBugCount,
      dashboard.metrics.scheduleVsForecast,
    ]) {
      if (metric.status === "risk" || metric.status === "watch") {
        risks.push(`${metric.label}: ${metric.displayValue}`);
      }
    }

    const uniqueRisks = [...new Set(risks)].slice(0, 8);
    const uniqueHighlights = [...new Set(highlights)].slice(0, 6);

    const blockers = dashboard.openBugs.slice(0, 5).map((bug) => {
      const age = bug.ageDays != null ? ` (${bug.ageDays}d)` : "";
      return `${bug.key}${age}: ${bug.summary ?? "Open bug"}`;
    });

    const generatedAt = new Date().toISOString();
    const weekLabel = new Date().toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const mdParts = [
      `# Status: ${name}`,
      ``,
      `**Client:** ${client}  `,
      `**Week of:** ${weekLabel}  `,
      `**Risk tier:** ${row?.riskTier ?? "unavailable"}`,
      ``,
      `## What moved`,
      uniqueHighlights.length
        ? uniqueHighlights.map((h) => `- ${h}`).join("\n")
        : "- Metrics snapshot loaded; no standout movement signals.",
      ``,
      `## Budget & schedule`,
      line("Budget burn", burn.displayValue),
      line("Runway", runway.displayValue),
      line(
        "Schedule vs forecast",
        dashboard.metrics.scheduleVsForecast.displayValue,
      ),
      line(
        "Remaining effort",
        dashboard.metrics.remainingEffortHours.displayValue,
      ),
      ``,
      `## Risks & blockers`,
      uniqueRisks.length
        ? uniqueRisks.map((r) => `- ${r}`).join("\n")
        : "- No threshold breaches in the current snapshot.",
      blockers.length
        ? `\n### Open bugs\n${blockers.map((b) => `- ${b}`).join("\n")}`
        : "",
      ``,
      `## Quality & flow`,
      line("Open bugs", dashboard.metrics.openBugCount.displayValue),
      line("Aging WIP", dashboard.metrics.agingWipCount.displayValue),
      line("Estimate coverage", dashboard.metrics.estimateCoveragePct.displayValue),
      line("Throughput (30d)", dashboard.metrics.throughput30d.displayValue),
      ``,
      `_Generated ${generatedAt}_`,
    ];

    const markdown = mdParts.filter((p) => p !== undefined).join("\n");
    const plainText = markdown
      .replace(/^#+\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/^_\s*|\s*_$/gm, "");

    void this.settings;

    return {
      projectId: id,
      title: `${name} — weekly status`,
      generatedAt,
      markdown,
      plainText,
      highlights: uniqueHighlights,
      risks: uniqueRisks,
    };
  }
}

export function createStatusNarrativeService(db: Db = getDb()) {
  const settings = createSettingsService(db);
  return new StatusNarrativeService(
    createPortfolioService(db, settings),
    createProjectDashboardService(settings),
    settings,
  );
}
