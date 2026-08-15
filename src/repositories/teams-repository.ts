import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import {
  teamMembers,
  teamOwnerships,
  teams,
  type NewTeam,
  type NewTeamMember,
  type NewTeamOwnership,
  type Team,
  type TeamMember,
  type TeamOwnership,
} from "@/db/schema";

export type TeamOwnershipWithName = {
  id: string;
  teamId: string;
  teamName: string;
  clientId: string;
  clientName: string | null;
  projectId: string;
  projectName: string | null;
};

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

  async listTeamIdsForAppUser(appUserId: string): Promise<string[]> {
    const rows = await this.db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.appUserId, appUserId));
    return [...new Set(rows.map((r) => r.teamId))];
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

  async listOwnerships(teamId?: string): Promise<TeamOwnership[]> {
    if (teamId) {
      return this.db
        .select()
        .from(teamOwnerships)
        .where(eq(teamOwnerships.teamId, teamId))
        .orderBy(desc(teamOwnerships.updatedAt));
    }
    return this.db
      .select()
      .from(teamOwnerships)
      .orderBy(desc(teamOwnerships.updatedAt));
  }

  async listOwnershipsWithTeamNames(
    teamId?: string,
  ): Promise<TeamOwnershipWithName[]> {
    const base = this.db
      .select({
        id: teamOwnerships.id,
        teamId: teamOwnerships.teamId,
        teamName: teams.name,
        clientId: teamOwnerships.clientId,
        clientName: teamOwnerships.clientName,
        projectId: teamOwnerships.projectId,
        projectName: teamOwnerships.projectName,
      })
      .from(teamOwnerships)
      .innerJoin(teams, eq(teamOwnerships.teamId, teams.id));
    const rows = teamId
      ? await base
          .where(eq(teamOwnerships.teamId, teamId))
          .orderBy(desc(teamOwnerships.updatedAt))
      : await base.orderBy(desc(teamOwnerships.updatedAt));
    return rows.map((r) => ({
      ...r,
      projectId: r.projectId ?? "",
    }));
  }

  async createOwnership(
    values: Pick<
      NewTeamOwnership,
      "teamId" | "clientId" | "clientName" | "projectId" | "projectName"
    >,
  ): Promise<TeamOwnership> {
    const [row] = await this.db
      .insert(teamOwnerships)
      .values({
        teamId: values.teamId,
        clientId: values.clientId.trim(),
        clientName: values.clientName?.trim() || null,
        projectId: (values.projectId ?? "").trim(),
        projectName: values.projectName?.trim() || null,
      })
      .returning();
    return row;
  }

  async deleteOwnership(id: string): Promise<boolean> {
    const [row] = await this.db
      .delete(teamOwnerships)
      .where(eq(teamOwnerships.id, id))
      .returning({ id: teamOwnerships.id });
    return Boolean(row);
  }

  async findOwnership(
    teamId: string,
    clientId: string,
    projectId: string,
  ): Promise<TeamOwnership | null> {
    const rows = await this.db
      .select()
      .from(teamOwnerships)
      .where(
        and(
          eq(teamOwnerships.teamId, teamId),
          eq(teamOwnerships.clientId, clientId),
          eq(teamOwnerships.projectId, projectId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }
}
