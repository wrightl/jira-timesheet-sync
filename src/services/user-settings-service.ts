import { getDb, type Db } from "@/db";
import { UserSettingsRepository } from "@/repositories/user-settings-repository";
import {
  GithubSettingsService,
  type GithubSettingsStatus,
} from "@/services/github-settings-service";

export type UserSettingsStatus = GithubSettingsStatus & {
  syncEnabled: boolean;
};

export class UserSettingsService {
  constructor(
    private readonly settings: UserSettingsRepository,
    private readonly github = new GithubSettingsService(settings),
  ) {}

  async getStatus(userId: string): Promise<UserSettingsStatus> {
    const [github, row] = await Promise.all([
      this.github.getStatus(userId),
      this.settings.getByUserId(userId),
    ]);
    return {
      ...github,
      syncEnabled: row?.syncEnabled ?? false,
    };
  }

  async saveSettings(
    userId: string,
    input: {
      token?: string;
      org?: string;
      githubRepos?: string[];
      syncEnabled?: boolean;
    },
  ): Promise<UserSettingsStatus> {
    if (
      input.token !== undefined ||
      input.org !== undefined ||
      input.githubRepos !== undefined
    ) {
      await this.github.saveSettings(userId, {
        token: input.token,
        org: input.org,
        repos: input.githubRepos,
      });
    }
    if (input.syncEnabled !== undefined) {
      const updated = await this.settings.upsertForUser(userId, {
        syncEnabled: input.syncEnabled,
      });
      if (!updated) {
        throw new Error("User not found");
      }
    }
    return this.getStatus(userId);
  }
}

export function createUserSettingsService(db: Db = getDb()) {
  return new UserSettingsService(new UserSettingsRepository(db));
}
