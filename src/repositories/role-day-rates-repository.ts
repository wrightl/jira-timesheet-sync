import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { roleDayRateSchedules } from "@/db/schema";
import {
  decodeRoleDayRates,
  encodeRoleDayRates,
  type RoleDayRateAmount,
  type RoleDayRateTitle,
} from "@/lib/role-day-rates";

export class DuplicateRoleDayRateScheduleError extends Error {
  constructor() {
    super("A rate set already starts in this month");
    this.name = "DuplicateRoleDayRateScheduleError";
  }
}

export type RoleDayRateScheduleRecord = {
  id: string;
  effectiveMonth: string;
  rates: { roleName: RoleDayRateTitle; dayRateCost: number }[];
  createdAt: Date;
  updatedAt: Date;
};

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("role_day_rate_schedules_month_uidx") ||
    message.includes("duplicate key")
  );
}

function toRecord(row: {
  id: string;
  effectiveMonth: string;
  ratesJson: string;
  createdAt: Date;
  updatedAt: Date;
}): RoleDayRateScheduleRecord {
  return {
    id: row.id,
    effectiveMonth: row.effectiveMonth,
    rates: decodeRoleDayRates(row.ratesJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class RoleDayRatesRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<RoleDayRateScheduleRecord[]> {
    const rows = await this.db
      .select()
      .from(roleDayRateSchedules)
      .orderBy(desc(roleDayRateSchedules.effectiveMonth));
    return rows.map(toRecord);
  }

  async findByMonth(
    effectiveMonth: string,
  ): Promise<RoleDayRateScheduleRecord | null> {
    const rows = await this.db
      .select()
      .from(roleDayRateSchedules)
      .where(eq(roleDayRateSchedules.effectiveMonth, effectiveMonth))
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async create(values: {
    effectiveMonth: string;
    rates: RoleDayRateAmount[];
  }): Promise<RoleDayRateScheduleRecord> {
    const existing = await this.findByMonth(values.effectiveMonth);
    if (existing) throw new DuplicateRoleDayRateScheduleError();

    try {
      const [row] = await this.db
        .insert(roleDayRateSchedules)
        .values({
          effectiveMonth: values.effectiveMonth,
          ratesJson: encodeRoleDayRates(values.rates),
        })
        .returning();
      return toRecord(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateRoleDayRateScheduleError();
      throw err;
    }
  }

  async update(
    id: string,
    values: { effectiveMonth: string; rates: RoleDayRateAmount[] },
  ): Promise<RoleDayRateScheduleRecord | null> {
    const currentRows = await this.db
      .select()
      .from(roleDayRateSchedules)
      .where(eq(roleDayRateSchedules.id, id))
      .limit(1);
    const current = currentRows[0];
    if (!current) return null;

    if (values.effectiveMonth !== current.effectiveMonth) {
      const clash = await this.findByMonth(values.effectiveMonth);
      if (clash && clash.id !== id) throw new DuplicateRoleDayRateScheduleError();
    }

    try {
      const [row] = await this.db
        .update(roleDayRateSchedules)
        .set({
          effectiveMonth: values.effectiveMonth,
          ratesJson: encodeRoleDayRates(values.rates),
          updatedAt: new Date(),
        })
        .where(eq(roleDayRateSchedules.id, id))
        .returning();
      return row ? toRecord(row) : null;
    } catch (err) {
      if (isUniqueViolation(err)) throw new DuplicateRoleDayRateScheduleError();
      throw err;
    }
  }

  async delete(id: string): Promise<boolean> {
    const [row] = await this.db
      .delete(roleDayRateSchedules)
      .where(eq(roleDayRateSchedules.id, id))
      .returning({ id: roleDayRateSchedules.id });
    return Boolean(row);
  }
}
