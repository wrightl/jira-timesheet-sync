import { ukBusinessHoursBetween } from "@/lib/uk-business-hours";
import type { JiraChangelogHistory } from "@/lib/jira-changelog";

function normaliseStatus(name: string | null | undefined): string {
  return name?.trim().toLowerCase() ?? "";
}

export function isWaitingForCustomerStatus(name: string | null | undefined): boolean {
  return normaliseStatus(name) === "waiting for customer";
}

export function isDoneStatusName(name: string | null | undefined): boolean {
  const status = normaliseStatus(name);
  return (
    status === "done" ||
    status === "closed" ||
    status === "resolved" ||
    status === "complete" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "won't fix"
  );
}

export function isResponseEndStatus(name: string | null | undefined): boolean {
  return isWaitingForCustomerStatus(name) || isDoneStatusName(name);
}

type StatusTransition = {
  at: string;
  fromStatus: string;
  toStatus: string;
};

function statusTransitions(
  histories: JiraChangelogHistory[],
): StatusTransition[] {
  const transitions: StatusTransition[] = [];
  const sorted = [...histories].sort(
    (a, b) => Date.parse(a.created ?? "") - Date.parse(b.created ?? ""),
  );

  for (const history of sorted) {
    if (!history.created || !Number.isFinite(Date.parse(history.created))) {
      continue;
    }
    for (const item of history.items ?? []) {
      if (item.field?.trim().toLowerCase() !== "status") continue;
      const toStatus = item.toString?.trim();
      if (!toStatus) continue;
      transitions.push({
        at: history.created,
        fromStatus: item.fromString?.trim() ?? "",
        toStatus,
      });
    }
  }

  return transitions;
}

/**
 * UK working hours (08:00–17:00 Mon–Fri, Europe/London) for each completed
 * agent response cycle.
 * A cycle starts at ticket created (or when work resumes after Waiting for
 * customer / Done) and ends when the ticket next moves to Waiting for customer
 * or Done. Repeat visits to those statuses each count as a separate cycle.
 */
export function responseCycleHours(options: {
  created: string | null;
  histories: JiraChangelogHistory[];
}): number[] {
  const transitions = statusTransitions(options.histories);
  const hours: number[] = [];

  const initialStatus = transitions[0]?.fromStatus ?? "";
  let cycleStart: Date | null =
    options.created && !isResponseEndStatus(initialStatus)
      ? new Date(options.created)
      : null;

  for (const transition of transitions) {
    const at = new Date(transition.at);
    const ending = isResponseEndStatus(transition.toStatus);

    if (cycleStart && ending && !isResponseEndStatus(transition.fromStatus)) {
      const cycleHours = ukBusinessHoursBetween(cycleStart, at);
      if (cycleHours > 0) hours.push(cycleHours);
      cycleStart = null;
      continue;
    }

    if (ending) {
      cycleStart = null;
      continue;
    }

    if (!cycleStart) {
      cycleStart = at;
    }
  }

  return hours;
}
