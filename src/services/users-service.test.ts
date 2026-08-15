import { describe, expect, it, vi } from "vitest";
import { UsersService } from "@/services/users-service";
import type { UsersRepository } from "@/repositories/users-repository";
import type { SessionsRepository } from "@/repositories/sessions-repository";
import type { UserSettingsRepository } from "@/repositories/user-settings-repository";

function publicUser(id = "u1") {
  return {
    id,
    email: "ada@example.com",
    role: "user" as const,
    syncEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("UsersService", () => {
  it("revokes all sessions when an admin sets a password", async () => {
    const deleteByUserId = vi.fn(async () => undefined);
    const users = {
      findById: async () => ({
        ...publicUser(),
        passwordHash: "old",
        mustSetPassword: false,
      }),
      update: async () => publicUser(),
      findPublicById: async () => publicUser(),
      countAdmins: async () => 1,
    } as unknown as UsersRepository;
    const sessions = { deleteByUserId } as unknown as SessionsRepository;
    const userSettings = {
      upsertForUser: vi.fn(),
    } as unknown as UserSettingsRepository;

    const service = new UsersService(users, sessions, userSettings);
    const result = await service.update(
      "u1",
      { password: "newpassword" },
      "admin-1",
    );

    expect("user" in result).toBe(true);
    expect(deleteByUserId).toHaveBeenCalledWith("u1");
  });

  it("does not revoke sessions when password is unchanged", async () => {
    const deleteByUserId = vi.fn(async () => undefined);
    const upsertForUser = vi.fn(async () => ({
      githubTokenEncrypted: null,
      githubOrg: null,
      githubTokenExpiresAt: null,
      githubExpiryReminder14dSentAt: null,
      githubExpiryReminder3dSentAt: null,
      githubReposJson: null,
      syncEnabled: true,
    }));
    const users = {
      findById: async () => ({
        ...publicUser(),
        passwordHash: "old",
        mustSetPassword: false,
      }),
      findPublicById: async () => ({ ...publicUser(), syncEnabled: true }),
      countAdmins: async () => 1,
    } as unknown as UsersRepository;
    const sessions = { deleteByUserId } as unknown as SessionsRepository;
    const userSettings = { upsertForUser } as unknown as UserSettingsRepository;

    const service = new UsersService(users, sessions, userSettings);
    await service.update("u1", { syncEnabled: true }, "admin-1");
    expect(deleteByUserId).not.toHaveBeenCalled();
    expect(upsertForUser).toHaveBeenCalledWith("u1", { syncEnabled: true });
  });
});
