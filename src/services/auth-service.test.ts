import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { AuthService } from "@/services/auth-service";
import type { UsersRepository } from "@/repositories/users-repository";
import type { SessionsRepository } from "@/repositories/sessions-repository";
import { hashPassword, hashSessionToken } from "@/lib/password";

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
        mustSetPassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    } as unknown as UsersRepository;
    const created: Array<{ token: string }> = [];
    const sessions = {
      create: async (values: { token: string }) => {
        created.push(values);
      },
    } as unknown as SessionsRepository;

    const service = new AuthService(users, sessions);
    const result = await service.login("ada@example.com", "password123");
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.email).toBe("ada@example.com");
      expect(result.token).toBeTruthy();
      expect(created[0]?.token).toBe(hashSessionToken(result.token));
      expect(created[0]?.token).not.toBe(result.token);
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

  it("rejects register for a provisioned mustSetPassword account", async () => {
    process.env.ALLOW_PUBLIC_REGISTER = "true";
    resetEnvCache();

    const passwordHash = await hashPassword("old-random");
    const users = {
      findByEmail: async () => ({
        id: "u1",
        email: "ada@example.com",
        passwordHash,
        role: "user" as const,
        mustSetPassword: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async () => {
        throw new Error("should not update");
      },
      createFull: async () => {
        throw new Error("should not create");
      },
    } as unknown as UsersRepository;

    const service = new AuthService(users, {} as SessionsRepository);
    const result = await service.register("ada@example.com", "password123");
    expect(result).toEqual({ error: "conflict" });
  });

  it("rejects register when email already has a password", async () => {
    process.env.ALLOW_PUBLIC_REGISTER = "true";
    resetEnvCache();

    const passwordHash = await hashPassword("password123");
    const users = {
      findByEmail: async () => ({
        id: "u1",
        email: "ada@example.com",
        passwordHash,
        role: "user" as const,
        mustSetPassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      createFull: async () => {
        throw new Error("should not create");
      },
    } as unknown as UsersRepository;

    const service = new AuthService(users, {} as SessionsRepository);
    const result = await service.register("ada@example.com", "password123");
    expect(result).toEqual({ error: "conflict" });
  });

  it("looks up sessions by hashed token and dual-reads plaintext", async () => {
    const lookedUp: string[] = [];
    const sessions = {
      findValidUserByToken: async (token: string) => {
        lookedUp.push(token);
        if (token === hashSessionToken("plain-cookie")) {
          return { id: "u1", email: "ada@example.com", role: "user" as const };
        }
        return null;
      },
    } as unknown as SessionsRepository;

    const service = new AuthService({} as UsersRepository, sessions);
    const user = await service.resolveSessionUser("plain-cookie");
    expect(user?.id).toBe("u1");
    expect(lookedUp).toEqual([hashSessionToken("plain-cookie")]);
  });

  it("falls back to plaintext token lookup when hash misses", async () => {
    const sessions = {
      findValidUserByToken: async (token: string) => {
        if (token === "legacy-plain") {
          return { id: "u1", email: "ada@example.com", role: "user" as const };
        }
        return null;
      },
    } as unknown as SessionsRepository;

    const service = new AuthService({} as UsersRepository, sessions);
    const user = await service.resolveSessionUser("legacy-plain");
    expect(user?.id).toBe("u1");
  });
});
