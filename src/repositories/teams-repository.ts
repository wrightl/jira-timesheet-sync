import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  teamMembers,
  teams,
  type NewTeam,
  type NewTeamMember,
  type Team,
  type TeamMember,
} from "@/db/schema";

export class TeamsRepository {
  constructor(private readonly db: Db) {}

  async listTeams(): Promise<Team[]> {
    return this.db.select().from(teams).orderBy(desc(teams.updatedAt));
  }

  async getTeam(id: string): Promise<Team | null> {
    const rows = await this.db
      .select()
      .from(teams)
      .where(eq(teams.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async createTeam(values: Pick<NewTeam, "name">): Promise<Team> {
    const [row] = await this.db
      .insert(teams)
      .values({ name: values.name.trim() })
      .returning();
    return row;
  }

  async updateTeam(id: string, name: string): Promise<Team | null> {
    const [row] = await this.db
      .update(teams)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning();
    return row ?? null;
  }

  async deleteTeam(id: string): Promise<boolean> {
    const [row] = await this.db
      .delete(teams)
      .where(eq(teams.id, id))
      .returning({ id: teams.id });
    return Boolean(row);
  }

  async listMembers(teamId?: string): Promise<TeamMember[]> {
    if (teamId) {
      return this.db
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId))
        .orderBy(desc(teamMembers.updatedAt));
    }
    return this.db
      .select()
      .from(teamMembers)
      .orderBy(desc(teamMembers.updatedAt));
  }

  async createMember(
    values: Pick<
      NewTeamMember,
      | "teamId"
      | "userMappingId"
      | "appUserId"
      | "displayName"
      | "weeklyCapacityHours"
    >,
  ): Promise<TeamMember> {
    const [row] = await this.db
      .insert(teamMembers)
      .values({
        teamId: values.teamId,
        userMappingId: values.userMappingId ?? null,
        appUserId: values.appUserId ?? null,
        displayName: values.displayName ?? null,
        weeklyCapacityHours: values.weeklyCapacityHours ?? "40",
      })
      .returning();
    return row;
  }

  async deleteMember(id: string): Promise<boolean> {
    const [row] = await this.db
      .delete(teamMembers)
      .where(eq(teamMembers.id, id))
      .returning({ id: teamMembers.id });
    return Boolean(row);
  }
}
