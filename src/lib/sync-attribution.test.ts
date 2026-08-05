import { beforeEach, describe, expect, it, vi } from "vitest";
import { userMappings, users } from "@/db/schema";
import { resolveAppUserIdForAuthor } from "@/lib/sync-attribution";

function createMockDb(options?: {
  mappingEmail?: string | null;
  appUserId?: string | null;
}) {
  const mappingEmail = options?.mappingEmail ?? null;
  const appUserId = options?.appUserId ?? null;

  return {
    select() {
      return {
        from(table: unknown) {
          const limitResult = () => {
            if (table === userMappings) {
              return Promise.resolve(
                mappingEmail !== null && mappingEmail !== undefined
                  ? [{ bitmapEmail: mappingEmail }]
                  : mappingEmail === null
                    ? [{ bitmapEmail: null }]
                    : [],
              );
            }
            if (table === users) {
              return Promise.resolve(
                appUserId ? [{ id: appUserId }] : [],
              );
            }
            return Promise.resolve([]);
          };

          return {
            where() {
              return { limit: limitResult };
            },
            limit: limitResult,
          };
        },
      };
    },
  };
}

describe("resolveAppUserIdForAuthor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when display name is missing", async () => {
    const db = createMockDb() as never;
    expect(await resolveAppUserIdForAuthor(db, null)).toBeNull();
    expect(await resolveAppUserIdForAuthor(db, "")).toBeNull();
  });

  it("returns null when no user mapping exists", async () => {
    const db = {
      select() {
        return {
          from() {
            return {
              where() {
                return {
                  limit: () => Promise.resolve([]),
                };
              },
            };
          },
        };
      },
    } as never;
    expect(await resolveAppUserIdForAuthor(db, "Ada Lovelace")).toBeNull();
  });

  it("returns null when mapping has no bitmap email", async () => {
    const db = createMockDb({ mappingEmail: null }) as never;
    expect(await resolveAppUserIdForAuthor(db, "Ada Lovelace")).toBeNull();
  });

  it("returns app user id when email bridge matches", async () => {
    const db = createMockDb({
      mappingEmail: "ada@example.com",
      appUserId: "user-1",
    }) as never;
    expect(await resolveAppUserIdForAuthor(db, "Ada Lovelace")).toBe("user-1");
  });

  it("returns null when email does not match an app user", async () => {
    const db = createMockDb({
      mappingEmail: "ada@example.com",
      appUserId: null,
    }) as never;
    expect(await resolveAppUserIdForAuthor(db, "Ada Lovelace")).toBeNull();
  });
});
