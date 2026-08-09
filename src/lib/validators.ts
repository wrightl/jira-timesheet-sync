import { z } from "zod";

export const mappingCreateSchema = z.object({
  jiraSpaceKey: z.string().min(1, "jiraSpaceKey is required"),
  clientId: z.string().min(1, "clientId is required"),
  enabled: z.boolean().optional().default(true),
});

export const mappingUpdateSchema = z.object({
  jiraSpaceKey: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
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
  clientId: z.string().min(1, "clientId is required"),
  projectId: z.string().min(1, "projectId is required"),
  projectBudgetId: z.string().min(1, "projectBudgetId is required"),
  projectName: z.string().nullable().optional(),
  budgetName: z.string().nullable().optional(),
  enabled: z.boolean().optional().default(true),
  userId: z.string().uuid().optional(),
});

export const userSpaceMappingUpdateSchema = z.object({
  jiraSpaceKey: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
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

export const registerSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const adminUserCreateSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "user"]).optional().default("user"),
});

export const adminUserUpdateSchema = z
  .object({
    role: z.enum(["admin", "user"]).optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .optional(),
  })
  .refine((data) => data.role !== undefined || data.password !== undefined, {
    message: "At least one of role or password is required",
  });

export const settingsUpdateSchema = z
  .object({
    internalPmAccessToken: z.string().min(1).optional(),
    jiraBaseUrl: z.string().optional(),
    jiraEmail: z.string().optional(),
    jiraApiToken: z.string().optional(),
  })
  .refine(
    (data) =>
      data.internalPmAccessToken !== undefined ||
      data.jiraBaseUrl !== undefined ||
      data.jiraEmail !== undefined ||
      data.jiraApiToken !== undefined,
    { message: "At least one settings field is required" },
  );

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
