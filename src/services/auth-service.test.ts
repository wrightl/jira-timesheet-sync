import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { AuthService } from "@/services/auth-service";
import type { UsersRepository } from "@/repositories/users-repository";
import type { SessionsRepository } from "@/repositories/sessions-repository";
import { hashPassword } from "@/lib/password";

describe("AuthService", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
    delete process.env.ALLOW_PUBLIC_REGISTER;
  });

  afterEach(() => {
    process.env = { ...prev };
    resetEnvCache();
  });

  it("logs in with valid credentials", async () => {
    const passwordHash = await hashPassword("password123");
    const users = {
      findByEmail: async () => ({
        id: "u1",
        email: "ada@example.com",
        passwordHash,
        role: "user" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    } as unknown as UsersRepository;
    const sessions = {
      create: async () => undefined,
    } as unknown as SessionsRepository;

    const service = new AuthService(users, sessions);
    const result = await service.login("ada@example.com", "password123");
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.email).toBe("ada@example.com");
      expect(result.token).toBeTruthy();
    }
  });

  it("rejects public register when disabled", async () => {
    process.env.ALLOW_PUBLIC_REGISTER = "false";
    resetEnvCache();
    const service = new AuthService(
      {} as UsersRepository,
      {} as SessionsRepository,
    );
    const result = await service.register("a@example.com", "password123");
    expect(result).toEqual({ error: "disabled" });
  });
});
