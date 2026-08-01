import { z } from "zod";

export const mappingCreateSchema = z.object({
  jiraSpaceId: z.string().min(1, "jiraSpaceId is required"),
  jiraSpaceKey: z.string().min(1, "jiraSpaceKey is required"),
  internalProjectId: z.string().min(1, "internalProjectId is required"),
  enabled: z.boolean().optional().default(true),
});

export const mappingUpdateSchema = z.object({
  jiraSpaceId: z.string().min(1).optional(),
  jiraSpaceKey: z.string().min(1).optional(),
  internalProjectId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export const settingsUpdateSchema = z.object({
  internalPmAccessToken: z.string().min(1, "Token is required"),
});

export type MappingCreateInput = z.infer<typeof mappingCreateSchema>;
export type MappingUpdateInput = z.infer<typeof mappingUpdateSchema>;
