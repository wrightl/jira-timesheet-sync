import { randomBytes } from "crypto";
import { getDb, type Db } from "@/db";
import { UserMappingsRepository } from "@/repositories/user-mappings-repository";
import { UsersRepository } from "@/repositories/users-repository";
import { normaliseEmail } from "@/lib/email";
import { hashPassword } from "@/lib/password";
import { log } from "@/lib/log";

/**
 * Resolve / provision the app user for a Jira worklog author via the email bridge:
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

    return this.users.findIdByEmailLower(normaliseEmail(bitmapEmail));
  }

  /**
   * Find or create an app user for the given Bitmap email.
   * Provisioned accounts use a random password and mustSetPassword=true.
   * Public register cannot claim them; an admin must set the password.
   */
  async ensureAppUserIdForEmail(
    emailRaw: string | null | undefined,
  ): Promise<string | null> {
    if (!emailRaw) return null;

    const email = normaliseEmail(emailRaw);
    if (!email) return null;

    const existingId = await this.users.findIdByEmailLower(email);
    if (existingId) return existingId;

    const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
    try {
      const user = await this.users.createFull({
        email,
        passwordHash,
        role: "user",
        mustSetPassword: true,
      });
      log.info("sync-attribution", "app_user_provisioned", {
        email,
        userId: user.id,
      });
      return user.id;
    } catch {
      // Unique race: another request inserted the same email.
      return this.users.findIdByEmailLower(email);
    }
  }

  async ensureAppUserIdForAuthor(
    authorDisplayName: string | null | undefined,
  ): Promise<string | null> {
    if (!authorDisplayName) return null;

    const bitmapEmail =
      await this.userMappings.findBitmapEmailByDisplayName(authorDisplayName);
    if (!bitmapEmail) return null;

    return this.ensureAppUserIdForEmail(bitmapEmail);
  }

  /** True when the given app login email is linked via a user mapping bitmapEmail. */
  async isAppUserLinkedViaEmail(appUserEmail: string): Promise<boolean> {
    return this.userMappings.existsByBitmapEmailLower(
      normaliseEmail(appUserEmail),
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
