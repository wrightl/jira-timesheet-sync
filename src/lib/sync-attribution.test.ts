import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncAttributionService } from "@/lib/sync-attribution";
import type { UserMappingsRepository } from "@/repositories/user-mappings-repository";
import type { UsersRepository } from "@/repositories/users-repository";

describe("SyncAttributionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createService(opts: {
    bitmapEmail?: string | null;
    existingUserId?: string | null;
    createdUserId?: string;
  }) {
    const userMappings = {
      findBitmapEmailByDisplayName: vi.fn(async () =>
        opts.bitmapEmail === undefined ? null : opts.bitmapEmail,
      ),
      existsByBitmapEmailLower: vi.fn(async () => false),
    } as unknown as UserMappingsRepository;

    const users = {
      findIdByEmailLower: vi.fn(async () => opts.existingUserId ?? null),
      createFull: vi.fn(async (values: { email: string }) => ({
        id: opts.createdUserId ?? "new-user",
        email: values.email,
        passwordHash: "hash",
        role: "user" as const,
        mustSetPassword: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    } as unknown as UsersRepository;

    return {
      service: new SyncAttributionService(userMappings, users),
      userMappings,
      users,
    };
  }

  describe("resolveAppUserIdForAuthor", () => {
    it("returns null when display name is missing", async () => {
      const { service } = createService({});
      expect(await service.resolveAppUserIdForAuthor(null)).toBeNull();
      expect(await service.resolveAppUserIdForAuthor("")).toBeNull();
    });

    it("returns null when no mapping email", async () => {
      const { service, users } = createService({ bitmapEmail: null });
      expect(await service.resolveAppUserIdForAuthor("Ada Lovelace")).toBeNull();
      expect(users.findIdByEmailLower).not.toHaveBeenCalled();
    });

    it("returns app user id when email bridge matches", async () => {
      const { service } = createService({
        bitmapEmail: "ada@example.com",
        existingUserId: "user-1",
      });
      expect(await service.resolveAppUserIdForAuthor("Ada Lovelace")).toBe(
        "user-1",
      );
    });

    it("returns null when email does not match an app user", async () => {
      const { service, users } = createService({
        bitmapEmail: "ada@example.com",
        existingUserId: null,
      });
      expect(await service.resolveAppUserIdForAuthor("Ada Lovelace")).toBeNull();
      expect(users.createFull).not.toHaveBeenCalled();
    });
  });

  describe("ensureAppUserIdForEmail", () => {
    it("returns null when email is missing", async () => {
      const { service, users } = createService({});
      expect(await service.ensureAppUserIdForEmail(null)).toBeNull();
      expect(await service.ensureAppUserIdForEmail("")).toBeNull();
      expect(users.createFull).not.toHaveBeenCalled();
    });

    it("returns existing user id without creating", async () => {
      const { service, users } = createService({
        existingUserId: "user-1",
      });
      expect(await service.ensureAppUserIdForEmail("ada@example.com")).toBe(
        "user-1",
      );
      expect(users.createFull).not.toHaveBeenCalled();
    });

    it("creates a claimable user when none exists", async () => {
      const { service, users } = createService({
        existingUserId: null,
        createdUserId: "provisioned-1",
      });
      expect(await service.ensureAppUserIdForEmail("Ada@Example.com")).toBe(
        "provisioned-1",
      );
      expect(users.createFull).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "ada@example.com",
          role: "user",
          mustSetPassword: true,
          passwordHash: expect.any(String),
        }),
      );
    });

    it("re-selects after unique race on create", async () => {
      const userMappings = {
        findBitmapEmailByDisplayName: vi.fn(),
      } as unknown as UserMappingsRepository;
      const findId = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("raced-user");
      const users = {
        findIdByEmailLower: findId,
        createFull: vi.fn(async () => {
          throw new Error("unique_violation");
        }),
      } as unknown as UsersRepository;

      const service = new SyncAttributionService(userMappings, users);
      expect(await service.ensureAppUserIdForEmail("ada@example.com")).toBe(
        "raced-user",
      );
    });
  });

  describe("ensureAppUserIdForAuthor", () => {
    it("returns null without mapping email", async () => {
      const { service, users } = createService({ bitmapEmail: null });
      expect(await service.ensureAppUserIdForAuthor("Ada")).toBeNull();
      expect(users.createFull).not.toHaveBeenCalled();
    });

    it("provisions via mapping email", async () => {
      const { service, users } = createService({
        bitmapEmail: "ada@example.com",
        existingUserId: null,
        createdUserId: "provisioned-1",
      });
      expect(await service.ensureAppUserIdForAuthor("Ada Lovelace")).toBe(
        "provisioned-1",
      );
      expect(users.createFull).toHaveBeenCalled();
    });
  });
});
