import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UtilisationLineChart } from "@/components/utilisation-line-chart";
import type { ChartSeries } from "@/components/utilisation-line-chart";

const points = [
  {
    date: "2026-08-19",
    billableHours: 4,
    workingHours: 5.4,
    utilisationPct: 74.1,
  },
  {
    date: "2026-08-20",
    billableHours: 10,
    workingHours: 10.7,
    utilisationPct: 93.5,
  },
  {
    date: "2026-08-21",
    billableHours: 14,
    workingHours: 16.1,
    utilisationPct: 87,
  },
  {
    date: "2026-08-22",
    billableHours: 18,
    workingHours: 21.4,
    utilisationPct: 84.1,
  },
  {
    date: "2026-08-23",
    billableHours: 20,
    workingHours: 26.8,
    utilisationPct: 74.6,
  },
  {
    date: "2026-08-24",
    billableHours: 26,
    workingHours: 32.1,
    utilisationPct: 81,
  },
  {
    date: "2026-08-25",
    billableHours: 30,
    workingHours: 37.5,
    utilisationPct: 80,
  },
];

const series: ChartSeries[] = [
  {
    key: "__team__",
    label: "Team average",
    color: "var(--accent)",
    points,
  },
  {
    key: "bm-ada",
    label: "Ada Lovelace",
    color: "#0f766e",
    points: points.map((point) => ({
      ...point,
      utilisationPct: (point.utilisationPct ?? 0) - 12,
    })),
  },
];

describe("UtilisationLineChart", () => {
  it("renders a line chart with a dotted 80% target line", () => {
    const html = renderToStaticMarkup(
      createElement(UtilisationLineChart, {
        series,
        targetPct: 80,
        initiallyVisibleKeys: ["__team__", "bm-ada"],
      }),
    );

    expect(html).toContain("role=\"img\"");
    expect(html).toContain("Billable utilisation versus the 80% target");
    expect(html).toContain("stroke-dasharray");
    expect(html).toContain("5 4");
    expect(html).toContain("80%");
    expect(html).toContain("Team average");
    expect(html).toContain("Ada Lovelace");
    expect(html).not.toContain("/utilisation/bm-ada");
    expect(html).not.toContain("Details");
  });
});
