import { z } from "zod";
import { isExcludedClientId } from "@/lib/excluded-clients";
import {
  isAllowedJiraBaseUrl,
  isAllowedSlackWebhookUrl,
} from "@/lib/outbound-urls";

const optionalJiraBaseUrl = z
  .string()
  .optional()
  .refine(
    (value) =>
      value === undefined ||
      value.trim() === "" ||
      isAllowedJiraBaseUrl(value),
    {
      message:
        "jiraBaseUrl must be https://*.atlassian.net with no credentials or API path",
    },
  );

const optionalSlackWebhookUrl = z
  .string()
  .optional()
  .refine(
    (value) =>
      value === undefined ||
      value.trim() === "" ||
      isAllowedSlackWebhookUrl(value),
    {
      message:
        "slackWebhookUrl must be an https://hooks.slack.com webhook",
    },
  );

const excludedClientMessage = "This client is excluded from the app";

const requiredClientId = z
  .string()
  .min(1, "clientId is required")
  .refine((id) => !isExcludedClientId(id), {
    message: excludedClientMessage,
  });

const optionalClientId = z
  .string()
  .min(1)
  .refine((id) => !isExcludedClientId(id), {
    message: excludedClientMessage,
  });

export const mappingCreateSchema = z.object({
  jiraSpaceKey: z.string().min(1, "jiraSpaceKey is required"),
  clientId: requiredClientId,
  enabled: z.boolean().optional().default(true),
});

export const mappingUpdateSchema = z.object({
  jiraSpaceKey: z.string().min(1).optional(),
  clientId: optionalClientId.optional(),
  enabled: z.boolean().optional(),
});

export const userMappingCreateSchema = z.object({
  jiraDisplayName: z.string().min(1, "jiraDisplayName is required"),
  jiraAccountId: z.string().nullable().optional(),
  bitmapUserId: z.string().min(1, "bitmapUserId is required"),
  bitmapEmail: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  enabled: z.boolean().optional().default(true),
});

export const userMappingUpdateSchema = z.object({
  jiraDisplayName: z.string().min(1).optional(),
  jiraAccountId: z.string().nullable().optional(),
  bitmapUserId: z.string().min(1).optional(),
  bitmapEmail: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

export const userSpaceMappingCreateSchema = z.object({
  jiraSpaceKey: z.string().min(1, "jiraSpaceKey is required"),
  clientId: requiredClientId,
  projectId: z.string().min(1, "projectId is required"),
  projectBudgetId: z.string().min(1, "projectBudgetId is required"),
  projectName: z.string().nullable().optional(),
  budgetName: z.string().nullable().optional(),
  enabled: z.boolean().optional().default(true),
  userId: z.string().uuid().optional(),
});

export const userSpaceMappingUpdateSchema = z.object({
  jiraSpaceKey: z.string().min(1).optional(),
  clientId: optionalClientId.optional(),
  projectId: z.string().min(1).optional(),
  projectBudgetId: z.string().min(1).optional(),
  projectName: z.string().nullable().optional(),
  budgetName: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const googleNativeAuthSchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
});

export const registerSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const adminUserCreateSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "user", "exec"]).optional().default("user"),
});

export const adminUserUpdateSchema = z
  .object({
    role: z.enum(["admin", "user", "exec"]).optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .optional(),
    syncEnabled: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.role !== undefined ||
      data.password !== undefined ||
      data.syncEnabled !== undefined,
    {
      message: "At least one of role, password, or syncEnabled is required",
    },
  );

export const meUpdateSchema = z.object({
  syncEnabled: z.boolean(),
});

export const githubRepoNameSchema = z
  .string()
  .trim()
  .regex(/^[^/\s]+\/[^/\s]+$/, "Repository must be owner/name")
  .max(200);

export const githubReposSchema = z
  .array(githubRepoNameSchema)
  .max(40, "Select at most 40 repositories")
  .transform((repos) => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const name of repos) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(name);
    }
    return unique;
  });

export const githubSettingsUpdateSchema = z
  .object({
    githubToken: z.string().optional(),
    githubOrg: z.string().optional(),
    githubRepos: githubReposSchema.optional(),
  })
  .refine(
    (data) =>
      data.githubToken !== undefined ||
      data.githubOrg !== undefined ||
      data.githubRepos !== undefined,
    { message: "At least one GitHub settings field is required" },
  );

export const userSettingsUpdateSchema = z
  .object({
    githubToken: z.string().optional(),
    githubOrg: z.string().optional(),
    githubRepos: githubReposSchema.optional(),
    syncEnabled: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.githubToken !== undefined ||
      data.githubOrg !== undefined ||
      data.githubRepos !== undefined ||
      data.syncEnabled !== undefined,
    { message: "At least one settings field is required" },
  );

export const settingsUpdateSchema = z
  .object({
    internalPmAccessToken: z.string().min(1).optional(),
    jiraBaseUrl: optionalJiraBaseUrl,
    jiraEmail: z.string().optional(),
    jiraApiToken: z.string().optional(),
    slackWebhookUrl: optionalSlackWebhookUrl,
    slackBotToken: z.string().optional(),
    supportDeskSpaceKey: z.string().optional(),
    alertEmail: z.string().nullable().optional(),
    alertThresholds: z
      .object({
        budgetBurnPctRisk: z.number().optional(),
        runwayDaysRisk: z.number().optional(),
        ageingWipRisk: z.number().optional(),
        openBugsRisk: z.number().optional(),
        syncFailedOpenRisk: z.number().optional(),
        estimateCoveragePctWatch: z.number().optional(),
        scheduleSlipDaysRisk: z.number().optional(),
      })
      .optional(),
  })
  .refine(
    (data) =>
      data.internalPmAccessToken !== undefined ||
      data.jiraBaseUrl !== undefined ||
      data.jiraEmail !== undefined ||
      data.jiraApiToken !== undefined ||
      data.slackWebhookUrl !== undefined ||
      data.slackBotToken !== undefined ||
      data.supportDeskSpaceKey !== undefined ||
      data.alertEmail !== undefined ||
      data.alertThresholds !== undefined,
    { message: "At least one settings field is required" },
  );

export const teamCreateSchema = z.object({
  name: z.string().min(1, "name is required"),
});

export const teamMemberCreateSchema = z.object({
  teamId: z.string().uuid(),
  userMappingId: z.string().uuid().nullable().optional(),
  appUserId: z.string().uuid().nullable().optional(),
  displayName: z.string().nullable().optional(),
  weeklyCapacityHours: z.string().optional(),
});

export const teamOwnershipCreateSchema = z.object({
  teamId: z.string().uuid(),
  clientId: z.string().min(1, "clientId is required"),
  clientName: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
});

export type MappingCreateInput = z.infer<typeof mappingCreateSchema>;
export type MappingUpdateInput = z.infer<typeof mappingUpdateSchema>;
export type UserMappingCreateInput = z.infer<typeof userMappingCreateSchema>;
export type UserMappingUpdateInput = z.infer<typeof userMappingUpdateSchema>;
export type UserSpaceMappingCreateInput = z.infer<
  typeof userSpaceMappingCreateSchema
>;
export type UserSpaceMappingUpdateInput = z.infer<
  typeof userSpaceMappingUpdateSchema
>;
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
export type MeUpdateInput = z.infer<typeof meUpdateSchema>;
export type GithubSettingsUpdateInput = z.infer<
  typeof githubSettingsUpdateSchema
>;
export type UserSettingsUpdateInput = z.infer<typeof userSettingsUpdateSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
