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

export const settingsUpdateSchema = z.object({
  internalPmAccessToken: z.string().min(1, "Token is required"),
});

export type MappingCreateInput = z.infer<typeof mappingCreateSchema>;
export type MappingUpdateInput = z.infer<typeof mappingUpdateSchema>;
export type UserMappingCreateInput = z.infer<typeof userMappingCreateSchema>;
export type UserMappingUpdateInput = z.infer<typeof userMappingUpdateSchema>;
