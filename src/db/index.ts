import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { requireDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";

// Local development only: route the Neon HTTP driver at a local proxy
// (see scripts/neon-local-proxy.mjs) so the app can run against a plain
// Postgres instance without a Neon Cloud account. Unset in production, where
// the driver talks to Neon directly.
const localFetchEndpoint = process.env.NEON_LOCAL_FETCH_ENDPOINT;
if (localFetchEndpoint) {
  neonConfig.fetchEndpoint = localFetchEndpoint;
}

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
