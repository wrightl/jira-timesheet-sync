export type SupportTicketMetrics = {
  totalCount: number;
  averageResponseTimeHours: number | null;
  ticketsByAssignee: Record<string, number>;
};

export function isTriagedStatus(status: string): boolean {
  return status.trim().toLowerCase() === "triaged";
}

export function metricsFromTickets(
  tickets: Array<{
    created: string | null;
    updated: string | null;
    assignee: string | null;
    responseCycleHours?: number[];
  }>,
): SupportTicketMetrics {
  const totalCount = tickets.length;

  let totalResponseTimeHours = 0;
  let responseCycleCount = 0;
  const ticketsByAssignee: Record<string, number> = {};

  for (const ticket of tickets) {
    for (const hours of ticket.responseCycleHours ?? []) {
      if (hours > 0) {
        totalResponseTimeHours += hours;
        responseCycleCount++;
      }
    }

    const assignee = ticket.assignee ?? "Unassigned";
    ticketsByAssignee[assignee] = (ticketsByAssignee[assignee] ?? 0) + 1;
  }

  const averageResponseTimeHours =
    responseCycleCount > 0
      ? totalResponseTimeHours / responseCycleCount
      : null;

  return {
    totalCount,
    averageResponseTimeHours,
    ticketsByAssignee,
  };
}
