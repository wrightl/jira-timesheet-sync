import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const syncStatusEnum = pgEnum("sync_status", [
  "synced",
  "skipped",
  "failed",
]);

export const syncEventTypeEnum = pgEnum("sync_event_type", [
  "worklog_created",
  "worklog_updated",
  "worklog_deleted",
]);

export const spaceProjectMappings = pgTable(
  "space_project_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jiraSpaceId: text("jira_space_id").notNull(),
    jiraSpaceKey: text("jira_space_key").notNull(),
    internalProjectId: text("internal_project_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("space_project_mappings_jira_space_id_uidx").on(
      table.jiraSpaceId,
    ),
  ],
);

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  internalPmAccessTokenEncrypted: text("internal_pm_access_token_encrypted"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const worklogSyncs = pgTable(
  "worklog_syncs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jiraWorklogId: text("jira_worklog_id").notNull(),
    jiraIssueKey: text("jira_issue_key"),
    jiraSpaceId: text("jira_space_id"),
    eventType: syncEventTypeEnum("event_type").notNull(),
    internalTimesheetId: text("internal_timesheet_id"),
    status: syncStatusEnum("status").notNull(),
    payloadHash: text("payload_hash").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("worklog_syncs_worklog_event_hash_uidx").on(
      table.jiraWorklogId,
      table.eventType,
      table.payloadHash,
    ),
    index("worklog_syncs_jira_worklog_id_idx").on(table.jiraWorklogId),
    index("worklog_syncs_created_at_idx").on(table.createdAt),
  ],
);

export type SpaceProjectMapping = typeof spaceProjectMappings.$inferSelect;
export type NewSpaceProjectMapping = typeof spaceProjectMappings.$inferInsert;
export type WorklogSync = typeof worklogSyncs.$inferSelect;
export type NewWorklogSync = typeof worklogSyncs.$inferInsert;
