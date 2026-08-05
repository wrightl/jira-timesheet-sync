import { getDb, type Db } from "@/db";
import { UserMappingsRepository } from "@/repositories/user-mappings-repository";
import { UsersRepository } from "@/repositories/users-repository";
import { normalizeEmail } from "@/lib/email";

/**
 * Resolve the app user for a Jira worklog author via the email bridge:
 * jiraDisplayName → user_mappings.bitmapEmail → users.email.
 */
export class SyncAttributionService {
  constructor(
    private readonly userMappings: UserMappingsRepository,
    private readonly users: UsersRepository,
  ) {}

  async resolveAppUserIdForAuthor(
    authorDisplayName: string | null | undefined,
  ): Promise<string | null> {
    if (!authorDisplayName) return null;

    const bitmapEmail =
      await this.userMappings.findBitmapEmailByDisplayName(authorDisplayName);
    if (!bitmapEmail) return null;

    return this.users.findIdByEmailLower(normalizeEmail(bitmapEmail));
  }

  /** True when the given app login email is linked via a user mapping bitmapEmail. */
  async isAppUserLinkedViaEmail(appUserEmail: string): Promise<boolean> {
    return this.userMappings.existsByBitmapEmailLower(
      normalizeEmail(appUserEmail),
    );
  }
}

export function createSyncAttributionService(db: Db = getDb()) {
  return new SyncAttributionService(
    new UserMappingsRepository(db),
    new UsersRepository(db),
  );
}

/** @deprecated Prefer SyncAttributionService. */
export async function resolveAppUserIdForAuthor(
  db: Db,
  authorDisplayName: string | null | undefined,
): Promise<string | null> {
  return createSyncAttributionService(db).resolveAppUserIdForAuthor(
    authorDisplayName,
  );
}

/** @deprecated Prefer SyncAttributionService. */
export async function isAppUserLinkedViaEmail(
  db: Db,
  appUserEmail: string,
): Promise<boolean> {
  return createSyncAttributionService(db).isAppUserLinkedViaEmail(appUserEmail);
}
