export type MetricHelpEntry = {
  title: string;
  formula: string;
  sources: string[];
  unavailable?: string;
  status?: string;
};

export const SYNC_METRIC_IDS = [
  "sync.synced",
  "sync.failed",
  "sync.skipped",
  "sync.pending",
  "sync.success_rate",
] as const;

export const PORTFOLIO_METRIC_IDS = [
  "portfolio.active_projects",
  "portfolio.risk",
  "portfolio.watch",
  "portfolio.ok",
  "portfolio.avg_burn",
] as const;

export const PROJECT_METRIC_IDS = [
  "budget_burn_pct",
  "billable_runway_hours",
  "budget_line_item_burn",
  "schedule_vs_forecast",
  "pace_delta_pct",
  "allocation_utilisation_pct",
  "billable_mix_pct",
  "runway_days",
  "remaining_hours_slip",
  "remaining_eng_weeks",
  "staffing_gap_eng_weeks",
  "staffing_ask",
  "forecast_confidence",
  "estimate_delta_hours",
  "remaining_effort_hours",
  "estimate_coverage_pct",
  "ticket_overage_rate_pct",
  "open_bug_count",
  "quality_cost_pct",
  "defect_injection_ratio",
  "throughput_30d",
  "ageing_wip_count",
  "cycle_time_median_days",
  "health_check_score",
] as const;

export const GITHUB_METRIC_IDS = [
  "open_prs",
  "draft_prs",
  "published_prs",
  "needs_review",
  "stale_prs",
  "median_open_age_h",
  "median_ttf_review_h",
  "merge_rate_weekly",
] as const;

export const SUPPORT_METRIC_IDS = [
  "support.total_tickets",
  "support.avg_response_time",
  "support.tickets_by_assignee",
] as const;

export const ALL_METRIC_HELP_IDS = [
  ...SYNC_METRIC_IDS,
  ...PORTFOLIO_METRIC_IDS,
  ...PROJECT_METRIC_IDS,
  ...GITHUB_METRIC_IDS,
  ...SUPPORT_METRIC_IDS,
] as const;

export type MetricHelpId = (typeof ALL_METRIC_HELP_IDS)[number];

const RISK_TIER_SHARED =
  "Each in-window project is scored, then counted after the current client, owner, team, and risk filters. A project is in the portfolio when its start date is on or before today and its end date is missing, open-ended, or on or after today. Risk is the highest matching signal: budget burn ≥90% (watch ≥85%); runway ≤5 days (watch ≤10); forecast end minus planned end ≥7 days late (watch if any days late); ≥3 failing Bitmap health checks (watch ≥1), or marked unhealthy; staffing gap ≥2 eng-weeks (watch ≥0.5). If burn, runway, slip, health checks, and remaining eng-weeks are all missing, the project is unavailable and is not counted in Risk, Watch, or Ok.";

export const METRIC_HELP: Record<MetricHelpId, MetricHelpEntry> = {
  "sync.synced": {
    title: "Synced",
    formula:
      "Count of worklog sync events whose status is synced, limited to the date range selected on the dashboard.",
    sources: [
      "Worklog sync records in this app’s database",
      "Dashboard date range (UTC)",
    ],
  },
  "sync.failed": {
    title: "Failed",
    formula:
      "Count of sync events that are still failed and not resolved. This is an all-time open backlog, not limited to the selected date range.",
    sources: ["Worklog sync records with open failed status"],
  },
  "sync.skipped": {
    title: "Skipped",
    formula:
      "Count of worklog sync events whose status is skipped, limited to the date range selected on the dashboard. Skip reasons are listed in the Skip reasons card.",
    sources: [
      "Worklog sync records in this app’s database",
      "Dashboard date range (UTC)",
    ],
  },
  "sync.pending": {
    title: "Pending",
    formula:
      "Count of sync events still waiting to process (pending or processing). This is an all-time open backlog, not limited to the selected date range.",
    sources: ["Worklog sync records with open pending/processing status"],
  },
  "sync.success_rate": {
    title: "Success rate",
    formula:
      "In the selected date range: synced ÷ (synced + failed + skipped). Pending events are excluded. The percentage is rounded to the nearest whole number.",
    sources: [
      "Worklog sync records in the selected date range",
    ],
    unavailable:
      "Shown as — when there are no synced, failed, or skipped events in the range (for example only pending work).",
  },
  "portfolio.active_projects": {
    title: "Active projects",
    formula:
      "Count of Bitmap projects in the current portfolio view after filters. A project is eligible when it is active and today falls in its start–end window (missing end date stays included; missing start date is excluded).",
    sources: [
      "Bitmap active projects",
      "Portfolio filters (client, owner, team, risk tier)",
    ],
  },
  "portfolio.risk": {
    title: "Risk",
    formula: `Count of filtered in-window projects whose risk tier is risk. ${RISK_TIER_SHARED}`,
    sources: [
      "Bitmap project budget, dates, health checks, and remaining hours",
      "Portfolio filters",
    ],
  },
  "portfolio.watch": {
    title: "Watch",
    formula: `Count of filtered in-window projects whose risk tier is watch. ${RISK_TIER_SHARED}`,
    sources: [
      "Bitmap project budget, dates, health checks, and remaining hours",
      "Portfolio filters",
    ],
  },
  "portfolio.ok": {
    title: "Ok",
    formula: `Count of filtered in-window projects whose risk tier is ok (no watch or risk signal). ${RISK_TIER_SHARED}`,
    sources: [
      "Bitmap project budget, dates, health checks, and remaining hours",
      "Portfolio filters",
    ],
  },
  "portfolio.avg_burn": {
    title: "Avg burn",
    formula:
      "Mean of each filtered project’s budget burn %, using only projects that have a burn value, rounded to one decimal place. Per project, burn is time_logged ÷ time_budgeted × 100 when a time budget exists; otherwise billable_time_used ÷ (billable_time_used + billable_time_remaining) × 100. The “Open sync failures” note under the card is a separate all-time count of open failed worklog syncs, not part of the average.",
    sources: [
      "Bitmap project time_logged / time_budgeted (or billable used + remaining)",
      "Portfolio filters",
    ],
    unavailable: "Shown as — when no filtered project has a computable burn percentage.",
  },
  budget_burn_pct: {
    title: "Budget burn",
    formula:
      "(billable_time_used if present, otherwise time_logged) ÷ time_budgeted × 100, rounded to one decimal place.",
    sources: ["Bitmap project time budget and logged/billable hours"],
    unavailable: "Shown as — when the project has no time_budgeted (or it is zero).",
    status: "Risk at ≥100% of budget; watch at ≥85%; otherwise ok.",
  },
  billable_runway_hours: {
    title: "Billable runway",
    formula:
      "Billable hours still available on the project: billable_time_remaining, or time_remaining if billable remaining is missing.",
    sources: ["Bitmap project remaining hours"],
    unavailable: "Shown as — when Bitmap does not provide remaining hours.",
    status: "Risk at ≤0 hours remaining; watch below 8 hours; otherwise ok.",
  },
  budget_line_item_burn: {
    title: "Budget line-item burn",
    formula:
      "For each Bitmap budget line, used hours ÷ budget hours × 100. Used hours prefer time_used, then billable_time_used. Budget hours prefer the line’s budget field, otherwise time_used + time_remaining. The headline value is the number of lines and the peak (worst) line burn.",
    sources: ["Bitmap project budget lines"],
    unavailable: "Shown as — when the project has no budget lines.",
    status: "Uses the same burn thresholds as Budget burn, applied to the peak line: risk ≥100%, watch ≥85%.",
  },
  schedule_vs_forecast: {
    title: "Schedule vs forecast",
    formula:
      "Calendar days between the forecast end date and the planned end date (forecast − planned). Positive means the forecast is later than the plan. Forecast end comes from the Bitmap project forecast_end_date, or the last point on the Bitmap burndown forecast if that field is missing.",
    sources: ["Bitmap project end date and forecast end (or burndown forecast)"],
    unavailable: "Shown as — when either the planned end or a forecast end date is missing.",
    status: "Risk at ≥7 days late; watch if any days late; on schedule or early is ok.",
  },
  pace_delta_pct: {
    title: "Pace",
    formula:
      "Budget burn % minus calendar elapsed %. Elapsed % is how far today sits between the project start and end dates, clamped between 0% and 100%. A positive pace means spend is ahead of the calendar.",
    sources: [
      "Bitmap time budget / logged hours (budget burn)",
      "Bitmap project start and end dates",
    ],
    unavailable:
      "Needs both a budget burn percentage and project start and end dates.",
    status: "Risk when burn is more than 15 percentage points ahead of the calendar; watch above 5 points.",
  },
  allocation_utilisation_pct: {
    title: "Allocation utilisation",
    formula: "time_logged ÷ time_allocated × 100.",
    sources: ["Bitmap project time_logged and time_allocated"],
    unavailable: "Shown as — when time allocated is missing or zero.",
    status: "Risk above 110%; watch below 70%; otherwise ok.",
  },
  billable_mix_pct: {
    title: "Billable mix",
    formula:
      "Sum of timesheet hours where billable is not false, divided by all loaded timesheet hours, × 100.",
    sources: ["Bitmap project timesheet entries"],
    unavailable: "Shown as — when no timesheet entries are loaded.",
    status: "Risk below 70% billable; watch below 85%; otherwise ok.",
  },
  runway_days: {
    title: "Runway (days)",
    formula:
      "Billable remaining hours ÷ average daily billable burn. Daily burn is the mean billable hours per calendar day in the last 14 days of timesheets (days with no billable time are omitted). If there are no recent billable timesheets, daily burn is inferred from the drop in Bitmap burndown remaining hours.",
    sources: [
      "Bitmap billable remaining hours",
      "Bitmap timesheet entries (14-day window)",
      "Bitmap burndown history as fallback",
    ],
    unavailable:
      "Needs remaining billable hours and a positive recent daily burn rate from timesheets or burndown.",
    status: "Risk at ≤5 days; watch at ≤10 days; otherwise ok.",
  },
  remaining_hours_slip: {
    title: "Remaining hours slip",
    formula:
      "Latest Bitmap burndown remaining hours minus remaining hours from about 7 days earlier. Positive means remaining work grew (scope or estimates increased).",
    sources: ["Bitmap burndown history"],
    unavailable: "Needs burndown points spanning about 7 days.",
    status: "Risk at ≥16 hours of growth; watch at ≥8 hours; otherwise ok.",
  },
  remaining_eng_weeks: {
    title: "Remaining eng-weeks",
    formula:
      "Remaining hours ÷ 40 (one eng-week). Remaining hours prefer live Jira remaining estimate when Jira metrics loaded, otherwise Bitmap remaining effort, otherwise billable remaining.",
    sources: [
      "Jira remaining estimates when configured",
      "Bitmap remaining hours / remaining effort",
    ],
    unavailable: "Shown as — when no remaining hours are available.",
  },
  staffing_gap_eng_weeks: {
    title: "Staffing gap",
    formula:
      "Remaining eng-weeks minus calendar weeks left until the target date, treating 1 FTE as 7 calendar days of capacity. Target date is the planned end date, or the forecast end if there is no planned end. If the target date is today or in the past and work remains, the gap equals remaining eng-weeks. Negative gaps are shown as 0.",
    sources: [
      "Remaining hours (see Remaining eng-weeks)",
      "Bitmap end date or forecast end date",
    ],
    unavailable: "Needs remaining hours and a project end or forecast date.",
    status: "Risk at ≥2 eng-weeks short; watch at ≥0.5; otherwise ok.",
  },
  staffing_ask: {
    title: "Staffing ask",
    formula:
      "A sentence from the staffing forecast: on track at 1 FTE through the target date; or “Need +X eng-weeks by {date}”; or remaining eng-weeks with no end date.",
    sources: [
      "Staffing gap and remaining eng-weeks",
      "Bitmap end / forecast date",
    ],
    unavailable: "Shown as — when remaining hours cannot be turned into an ask.",
    status: "Uses the same thresholds as Staffing gap.",
  },
  forecast_confidence: {
    title: "Forecast confidence",
    formula:
      "high if remaining hours exist, Jira remaining effort is present, and estimate coverage is ≥90%; medium if Jira remaining effort is present or coverage is ≥70%; low if remaining hours exist but those signals are weaker; unavailable if remaining hours are missing.",
    sources: [
      "Jira remaining estimates and estimate coverage",
      "Bitmap remaining hours",
    ],
    status: "low is shown as watch; unavailable is unavailable; high and medium are ok.",
  },
  estimate_delta_hours: {
    title: "Jira vs Bitmap estimate delta",
    formula:
      "When live Jira metrics and Bitmap time_remaining both exist: Jira remaining estimate hours minus Bitmap time_remaining. Otherwise Bitmap’s stored remaining_jira_estimates_delta.hours. Negative means Jira remaining is lower than Bitmap’s remaining budget.",
    sources: ["Jira remaining estimates", "Bitmap time_remaining / stored delta"],
    unavailable: "Shown as — when neither a live comparison nor a Bitmap delta is available.",
    status: "Risk if the live/stored delta is ≤ −8 hours (Jira remaining much lower); watch if negative but above −8.",
  },
  remaining_effort_hours: {
    title: "Remaining effort",
    formula:
      "Sum of remaining estimates on open Jira issues in the project’s Jira budget JQL (or project-key fallback) when Jira is configured. Otherwise Bitmap jira_budget_remaining_effort.",
    sources: ["Jira remaining estimates", "Bitmap remaining effort as fallback"],
    unavailable: "Shown as — when neither Jira nor Bitmap remaining effort is available.",
    status: "Watch if Jira remaining is more than 8 hours above Bitmap time_remaining.",
  },
  estimate_coverage_pct: {
    title: "Estimate coverage",
    formula:
      "Open Jira issues that have an original estimate, divided by all open issues in scope, × 100.",
    sources: ["Jira issues in the project’s scoped JQL"],
    unavailable:
      "Requires Jira Cloud API configuration and a successful issue search for the project.",
    status: "Risk below 70%; watch below 90%; otherwise ok.",
  },
  ticket_overage_rate_pct: {
    title: "Ticket overage rate",
    formula:
      "When Jira metrics are available: issues whose time spent exceeds original estimate, divided by all in-scope issues, × 100. If Jira did not load but Bitmap Jira tickets exist, the rate is Bitmap tickets with overage > 0 or unexpected_overage, divided by those tickets.",
    sources: ["Jira time spent vs original estimate", "Bitmap Jira ticket overages as fallback"],
    unavailable: "Requires Jira metrics or Bitmap Jira ticket rows.",
    status: "Risk at ≥25% of tickets over estimate; watch at ≥10%.",
  },
  open_bug_count: {
    title: "Open bugs",
    formula:
      "Count of open in-scope Jira issues whose issue type name includes “bug”.",
    sources: ["Jira issues in the project’s scoped JQL"],
    unavailable: "Requires a configured Jira Cloud API and a successful search.",
    status: "Risk at ≥10 open bugs; watch at ≥3.",
  },
  quality_cost_pct: {
    title: "Rework / quality cost",
    formula:
      "Non-billable timesheet hours whose nonbillable_reason contains “quality”, divided by all loaded timesheet hours, × 100.",
    sources: ["Bitmap project timesheet entries"],
    unavailable: "Shown as — when no timesheet entries are loaded.",
    status: "Risk at ≥15% of hours; watch at ≥5%.",
  },
  defect_injection_ratio: {
    title: "Defect injection",
    formula:
      "Bugs created in the last 30 days ÷ story-like issues completed in the last 30 days (stories, tasks, and features, using last-updated as the done date). If no stories completed but bugs were created, the ratio is unavailable; if neither, it is 0.",
    sources: ["Jira issues in the project’s scoped JQL"],
    unavailable: "Requires Jira metrics; also unavailable when bugs were created but no story-like work completed in 30 days.",
    status: "Risk at ≥1.0 (at least one bug per completed story); watch at ≥0.5.",
  },
  throughput_30d: {
    title: "Throughput (30d)",
    formula:
      "Count of story-like Jira issues (stories, tasks, features) marked done whose last update was in the last 30 days.",
    sources: ["Jira issues in the project’s scoped JQL"],
    unavailable: "Requires a configured Jira Cloud API and a successful search.",
    status: "Ok if at least one completed; watch if none completed but there are still open issues.",
  },
  ageing_wip_count: {
    title: "Ageing WIP",
    formula:
      "Count of open in-scope Jira issues not updated for 14 or more days.",
    sources: ["Jira issues in the project’s scoped JQL"],
    unavailable: "Requires a configured Jira Cloud API and a successful search.",
    status: "Risk at ≥10 stale open issues; watch at ≥5.",
  },
  cycle_time_median_days: {
    title: "Cycle time (median)",
    formula:
      "Median calendar days from created to last updated for in-scope issues that were done in the last 30 days (using last update as the completion proxy).",
    sources: ["Jira issues in the project’s scoped JQL"],
    unavailable:
      "Shown as — when Jira is unavailable or no issues were completed in the last 30 days.",
    status: "Risk at ≥21 days; watch at ≥10 days.",
  },
  health_check_score: {
    title: "Health checks",
    formula:
      "Count of Bitmap health checks on the project with healthy === false, shown as failing / total.",
    sources: ["Bitmap project health checks"],
    unavailable: "Shown as — when Bitmap returns no health checks.",
    status: "Risk at ≥3 failing checks; watch at ≥1; all passing is ok.",
  },
  open_prs: {
    title: "Open pull requests",
    formula:
      "GitHub search count of open pull requests in the selected repositories from Settings, or across the whole organisation if none are selected. Table filters on this page do not change this number.",
    sources: ["GitHub Search API", "GitHub repositories saved in Settings"],
    status: "Watch at ≥25 open PRs; risk at ≥50.",
  },
  draft_prs: {
    title: "Draft PRs",
    formula:
      "GitHub search count of open pull requests with is:draft, in the same Settings repository scope as the other GitHub cards. Table filters do not apply.",
    sources: ["GitHub Search API (is:draft)", "GitHub repositories saved in Settings"],
  },
  published_prs: {
    title: "Published open PRs",
    formula:
      "Open pull requests minus draft pull requests (floored at 0), using the same Settings repository scope.",
    sources: ["GitHub Search API open and draft counts"],
    status: "Watch at ≥20 published open PRs; risk at ≥40.",
  },
  needs_review: {
    title: "PRs needing review",
    formula:
      "GitHub search count of open pull requests with review:required, in the Settings repository scope. Table filters do not apply.",
    sources: ["GitHub Search API (review:required)"],
    status: "Watch at ≥10; risk at ≥20.",
  },
  stale_prs: {
    title: "Stale PRs (7d+)",
    formula:
      "GitHub search count of open pull requests whose updated date is before today minus 7 days, in the Settings repository scope.",
    sources: ["GitHub Search API (updated:<cutoff)"],
    status: "Watch at ≥5; risk at ≥12.",
  },
  median_open_age_h: {
    title: "Median open age (h)",
    formula:
      "Median hours from each sampled open PR’s created time to now. The sample is the most recently returned open PRs (up to 40) in the Settings repository scope, not the full org history. Table filters do not apply.",
    sources: ["GitHub open pull request search sample"],
    unavailable: "Shown as — when the sample has no parseable created timestamps.",
    status: "Watch at ≥48 hours; risk at ≥120 hours.",
  },
  median_ttf_review_h: {
    title: "Median time to first review (h)",
    formula:
      "Median hours from created to firstReviewedAt for sampled open PRs that already have a first review. Same up-to-40 open PR sample as median open age.",
    sources: ["GitHub open pull request sample (first review timestamp)"],
    unavailable: "Shown as — when none of the sampled open PRs have a first review time.",
    status: "Watch at ≥24 hours; risk at ≥72 hours.",
  },
  merge_rate_weekly: {
    title: "Merges / week (30d)",
    formula:
      "Count of pull requests merged in the last 30 days in the Settings repository scope, divided by 30/7 (weeks), rounded to one decimal place.",
    sources: ["GitHub merged pull request search (last 30 days)"],
    status: "Watch if the rate is 0; otherwise ok.",
  },
  "support.total_tickets": {
    title: "Total Tickets",
    formula:
      "Count of tickets currently visible in the list. Hidden Triaged tickets are excluded unless “Show Triaged tickets” is on.",
    sources: [
      "Support desk Jira issues loaded for this page",
      "Show Triaged toggle",
    ],
  },
  "support.avg_response_time": {
    title: "Avg Response Time",
    formula:
      "Mean of completed agent response cycles on visible tickets. A cycle starts at ticket created (or when work resumes after Waiting for customer / Done) and ends at the next transition to Waiting for customer or Done. Hours are UK working hours only (08:00–17:00 Monday–Friday, Europe/London). Cycles of 0 hours are ignored. The SLA badge compares that average to 8 hours.",
    sources: [
      "Jira changelog status transitions",
      "UK business-hours calculator",
      "Visible tickets (Show Triaged toggle)",
    ],
    unavailable:
      "Shown as — when no visible ticket has a completed response cycle with hours > 0.",
    status: "Over 8h SLA when the average is greater than 8 hours; otherwise Within 8h SLA.",
  },
  "support.tickets_by_assignee": {
    title: "Tickets by Assignee",
    formula:
      "Count of visible tickets grouped by assignee display name (Unassigned if none). The card lists the top 5 assignees by ticket count.",
    sources: [
      "Support desk Jira assignee field",
      "Visible tickets (Show Triaged toggle)",
    ],
  },
};

export function getMetricHelp(id: string): MetricHelpEntry | undefined {
  return METRIC_HELP[id as MetricHelpId];
}
