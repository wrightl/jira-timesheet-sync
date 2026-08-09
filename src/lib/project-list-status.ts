export const PROJECT_LIST_STATUSES = [
  "all",
  "active",
  "upcoming",
  "completed",
] as const;

export type ProjectListStatus = (typeof PROJECT_LIST_STATUSES)[number];

export function isProjectListStatus(
  value: string | null | undefined,
): value is ProjectListStatus {
  return (
    value === "all" ||
    value === "active" ||
    value === "upcoming" ||
    value === "completed"
  );
}
