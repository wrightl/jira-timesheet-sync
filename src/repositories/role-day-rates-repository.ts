import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { roleDayRates, type RoleDayRate } from "@/db/schema";
import { normaliseRoleKey } from "@/lib/profitability";

export class DuplicateRoleDayRateError extends Error {
  constructor() {
    super("A day rate for this role already exists");
    this.name = "DuplicateRoleDayRateError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("role_day_rates_role_key_uidx") ||
    message.includes("duplicate key")
  );
}

function asDayRate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export class RoleDayRatesRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<RoleDayRate[]> {
    const rows = await this.db
      .select()
      .from(roleDayRates)
      .orderBy(asc(roleDayRates.roleName));
    return rows.map((row) => ({
      ...row,
      dayRateCost: asDayRate(row.dayRateCost),
    }));
  }

  async findByRoleKey(roleKey: string): Promise<RoleDayRate | null> {
    const rows = await this.db
      .select()
      .from(roleDayRates)
      .where(eq(roleDayRates.roleKey, roleKey))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ...row, dayRateCost: asDayRate(row.dayRateCost) };
  }

  async create(values: {
    roleName: string;
    dayRateCost: number;
  }): Promise<RoleDayRate> {
    const roleName = values.roleName.trim().replace(/\s+/g, " ");
    const roleKey = normaliseRoleKey(roleName);
    const existing = await this.findByRoleKey(roleKey);
    if (existing) throw new DuplicateRoleDayRateError();

    try {
      const [row] = await this.db
        .insert(roleDayRates)
        .values({
          roleName,
          roleKey,
          dayRateCost: values.dayRateCost,
        })
        .returning();
      return { ...row, dayRateCost: asDayRate(row.dayRateCost) };
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateRoleDayRateError();
      throw err;
    }
  }

  async update(
    id: string,
    values: { roleName?: string; dayRateCost?: number },
  ): Promise<RoleDayRate | null> {
    const currentRows = await this.db
      .select()
      .from(roleDayRates)
      .where(eq(roleDayRates.id, id))
      .limit(1);
    const current = currentRows[0];
    if (!current) return null;

    const roleName =
      values.roleName !== undefined
        ? values.roleName.trim().replace(/\s+/g, " ")
        : current.roleName;
    const roleKey = normaliseRoleKey(roleName);
    if (roleKey !== current.roleKey) {
      const clash = await this.findByRoleKey(roleKey);
      if (clash && clash.id !== id) throw new DuplicateRoleDayRateError();
    }

    try {
      const [row] = await this.db
        .update(roleDayRates)
        .set({
          roleName,
          roleKey,
          dayRateCost: values.dayRateCost ?? current.dayRateCost,
          updatedAt: new Date(),
        })
        .where(eq(roleDayRates.id, id))
        .returning();
      if (!row) return null;
      return { ...row, dayRateCost: asDayRate(row.dayRateCost) };
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateRoleDayRateError();
      throw err;
    }
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await this.db
      .delete(roleDayRates)
      .where(eq(roleDayRates.id, id))
      .returning({ id: roleDayRates.id });
    return Boolean(row);
  }
}
