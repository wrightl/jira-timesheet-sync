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
  "pending",
  "processing",
  "synced",
  "skipped",
  "failed",
]);

export const syncEventTypeEnum = pgEnum("sync_event_type", [
  "worklog_created",
  "worklog_updated",
  "worklog_deleted",
]);

export const apiCacheResourceTypeEnum = pgEnum("api_cache_resource_type", [
  "projects",
  "project_budgets",
  "jira_search",
]);

export const userRoleEnum = pgEnum("user_role", ["admin", "user", "exec"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("user"),
    mustSetPassword: boolean("must_set_password").notNull().default(false),
    syncEnabled: boolean("sync_enabled").notNull().default(false),
    githubTokenEncrypted: text("github_token_encrypted"),
    githubOrg: text("github_org"),
    oauthProvider: text("oauth_provider"),
    oauthSubject: text("oauth_subject"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_uidx").on(table.email),
    uniqueIndex("users_oauth_provider_subject_uidx").on(
      table.oauthProvider,
      table.oauthSubject,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_uidx").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const spaceProjectMappings = pgTable(
  "space_project_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jiraSpaceKey: text("jira_space_key").notNull(),
    clientId: text("client_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("space_project_mappings_jira_space_key_uidx").on(
      table.jiraSpaceKey,
    ),
  ],
);

export const userMappings = pgTable(
  "user_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jiraDisplayName: text("jira_display_name").notNull(),
    jiraAccountId: text("jira_account_id"),
    bitmapUserId: text("bitmap_user_id").notNull(),
    bitmapEmail: text("bitmap_email"),
    jobTitle: text("job_title"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_mappings_jira_display_name_uidx").on(
      table.jiraDisplayName,
    ),
  ],
);

export const userSpaceMappings = pgTable(
  "user_space_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jiraSpaceKey: text("jira_space_key").notNull(),
    clientId: text("client_id").notNull(),
    projectId: text("project_id").notNull(),
    projectBudgetId: text("project_budget_id").notNull(),
    projectName: text("project_name"),
    budgetName: text("budget_name"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_space_mappings_user_space_uidx").on(
      table.userId,
      table.jiraSpaceKey,
    ),
    index("user_space_mappings_user_id_idx").on(table.userId),
  ],
);

export const apiCache = pgTable(
  "api_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cacheKey: text("cache_key").notNull(),
    resourceType: apiCacheResourceTypeEnum("resource_type").notNull(),
    requestMeta: text("request_meta").notNull(),
    responseBody: text("response_body").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("api_cache_cache_key_uidx").on(table.cacheKey),
    index("api_cache_expires_at_idx").on(table.expiresAt),
    index("api_cache_resource_type_idx").on(table.resourceType),
  ],
);

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  internalPmAccessTokenEncrypted: text("internal_pm_access_token_encrypted"),
  jiraBaseUrl: text("jira_base_url"),
  jiraEmail: text("jira_email"),
  jiraApiTokenEncrypted: text("jira_api_token_encrypted"),
  slackWebhookUrlEncrypted: text("slack_webhook_url_encrypted"),
  slackBotTokenEncrypted: text("slack_bot_token_encrypted"),
  supportDeskSpaceKey: text("support_desk_space_key"),
  alertEmail: text("alert_email"),
  alertThresholdsJson: text("alert_thresholds_json"),
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
    rawPayload: text("raw_payload"),
    error: text("error"),
    authorAccountId: text("author_account_id"),
    authorDisplayName: text("author_display_name"),
    appUserId: uuid("app_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
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
    index("worklog_syncs_status_created_at_idx").on(
      table.status,
      table.createdAt,
    ),
    index("worklog_syncs_app_user_id_created_at_idx").on(
      table.appUserId,
      table.createdAt,
    ),
    index("worklog_syncs_author_account_id_created_at_idx").on(
      table.authorAccountId,
      table.createdAt,
    ),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("teams_name_uidx").on(table.name)],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userMappingId: uuid("user_mapping_id").references(() => userMappings.id, {
      onDelete: "set null",
    }),
    appUserId: uuid("app_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    displayName: text("display_name"),
    weeklyCapacityHours: text("weekly_capacity_hours").default("40"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("team_members_team_id_idx").on(table.teamId),
    index("team_members_app_user_id_idx").on(table.appUserId),
  ],
);

export const supportTicketReminders = pgTable(
  "support_ticket_reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jiraIssueKey: text("jira_issue_key").notNull(),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    assigneeEmail: text("assignee_email"),
    slackUserId: text("slack_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("support_ticket_reminders_issue_key_idx").on(table.jiraIssueKey),
    index("support_ticket_reminders_sent_at_idx").on(table.reminderSentAt),
  ],
);

/**
 * Links a team to a Bitmap client (whole-client ownership) and optionally a
 * specific project. Empty projectId means client-level ownership.
 */
export const teamOwnerships = pgTable(
  "team_ownerships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    clientName: text("client_name"),
    projectId: text("project_id").notNull().default(""),
    projectName: text("project_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("team_ownerships_team_client_project_uidx").on(
      table.teamId,
      table.clientId,
      table.projectId,
    ),
    index("team_ownerships_team_id_idx").on(table.teamId),
    index("team_ownerships_client_id_idx").on(table.clientId),
  ],
);

export type AppUser = typeof users.$inferSelect;
export type NewAppUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SpaceProjectMapping = typeof spaceProjectMappings.$inferSelect;
export type NewSpaceProjectMapping = typeof spaceProjectMappings.$inferInsert;
export type UserMapping = typeof userMappings.$inferSelect;
export type NewUserMapping = typeof userMappings.$inferInsert;
export type UserSpaceMapping = typeof userSpaceMappings.$inferSelect;
export type NewUserSpaceMapping = typeof userSpaceMappings.$inferInsert;
export type ApiCacheEntry = typeof apiCache.$inferSelect;
export type NewApiCacheEntry = typeof apiCache.$inferInsert;
export type WorklogSync = typeof worklogSyncs.$inferSelect;
export type NewWorklogSync = typeof worklogSyncs.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type SupportTicketReminder = typeof supportTicketReminders.$inferSelect;
export type NewSupportTicketReminder = typeof supportTicketReminders.$inferInsert;
export type TeamOwnership = typeof teamOwnerships.$inferSelect;
export type NewTeamOwnership = typeof teamOwnerships.$inferInsert;
