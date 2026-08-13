import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import {
  GoogleOAuthService,
  getGoogleOAuthConfig,
} from "@/services/google-oauth-service";
import { AuthService } from "@/services/auth-service";
import type { UsersRepository } from "@/repositories/users-repository";

function googleFetch(profile: {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  hd?: string;
}): typeof fetch {
  return vi.fn(async (url: string | URL) => {
    const href = String(url);
    if (href.includes("/token")) {
      return {
        ok: true,
        json: async () => ({ access_token: "access-token" }),
        text: async () => "",
      } as Response;
    }
    return {
      ok: true,
      json: async () => profile,
      text: async () => "",
    } as Response;
  }) as unknown as typeof fetch;
}

describe("GoogleOAuthService", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetEnvCache();
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.GOOGLE_ALLOWED_DOMAIN = "example.com";
  });

  afterEach(() => {
    process.env = { ...prev };
    resetEnvCache();
  });

  it("returns null in production when GOOGLE_ALLOWED_DOMAIN is missing", () => {
    delete process.env.GOOGLE_ALLOWED_DOMAIN;
    process.env.NODE_ENV = "production";
    resetEnvCache();
    expect(getGoogleOAuthConfig()).toBeNull();
  });

  it("allows omitting GOOGLE_ALLOWED_DOMAIN outside production", () => {
    delete process.env.GOOGLE_ALLOWED_DOMAIN;
    process.env.NODE_ENV = "test";
    resetEnvCache();
    expect(getGoogleOAuthConfig()).toEqual(
      expect.objectContaining({
        clientId: "client-id",
        allowedDomain: null,
      }),
    );
  });

  it("does not link Google onto a claimed password account", async () => {
    const update = vi.fn();
    const users = {
      findByOAuth: async () => null,
      findByEmail: async () => ({
        id: "u1",
        email: "ada@example.com",
        passwordHash: "hash",
        role: "user" as const,
        mustSetPassword: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update,
    } as unknown as UsersRepository;
    const auth = {
      createSession: async () => {
        throw new Error("should not create session");
      },
    } as unknown as AuthService;

    const service = new GoogleOAuthService(
      users,
      auth,
      googleFetch({
        sub: "google-sub",
        email: "ada@example.com",
        email_verified: true,
        hd: "example.com",
      }),
    );

    await expect(service.exchangeCode("code")).rejects.toThrow(
      /already registered/,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("links Google onto a provisioned mustSetPassword account", async () => {
    const existing = {
      id: "u1",
      email: "ada@example.com",
      passwordHash: "hash",
      role: "user" as const,
      mustSetPassword: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const update = vi.fn(async () => existing);
    const users = {
      findByOAuth: async () => null,
      findByEmail: async () => existing,
      findById: async () => existing,
      update,
    } as unknown as UsersRepository;
    const createSession = vi.fn(async () => ({
      token: "session-token",
      expiresAt: new Date(),
    }));
    const auth = { createSession } as unknown as AuthService;

    const service = new GoogleOAuthService(
      users,
      auth,
      googleFetch({
        sub: "google-sub",
        email: "ada@example.com",
        email_verified: true,
        hd: "example.com",
      }),
    );

    const result = await service.exchangeCode("code");
    expect(result.user.id).toBe("u1");
    expect(update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        oauthProvider: "google",
        oauthSubject: "google-sub",
        mustSetPassword: false,
      }),
    );
    expect(createSession).toHaveBeenCalledWith("u1");
  });
});
