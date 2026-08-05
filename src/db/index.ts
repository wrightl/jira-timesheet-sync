import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { requireDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";

function createDb() {
  const sql = neon(requireDatabaseUrl());
  return drizzle({ client: sql, schema });
}

export type Db = ReturnType<typeof createDb>;

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

/** Test helper to inject a mock database. */
export function setDb(db: Db | null) {
  _db = db;
}
