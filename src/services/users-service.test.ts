import { describe, expect, it, vi } from "vitest";
import { UsersService } from "@/services/users-service";
import type { UsersRepository } from "@/repositories/users-repository";
import type { SessionsRepository } from "@/repositories/sessions-repository";

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
      countAdmins: async () => 1,
    } as unknown as UsersRepository;
    const sessions = { deleteByUserId } as unknown as SessionsRepository;

    const service = new UsersService(users, sessions);
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
    const users = {
      findById: async () => ({
        ...publicUser(),
        passwordHash: "old",
        mustSetPassword: false,
      }),
      update: async () => publicUser(),
      countAdmins: async () => 1,
    } as unknown as UsersRepository;
    const sessions = { deleteByUserId } as unknown as SessionsRepository;

    const service = new UsersService(users, sessions);
    await service.update("u1", { syncEnabled: true }, "admin-1");
    expect(deleteByUserId).not.toHaveBeenCalled();
  });
});
