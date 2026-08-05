import { getDb } from "../src/db";
import { parseWorklogWebhookPayload } from "../src/lib/worklog-parser";
import { createSyncAttributionService } from "../src/lib/sync-attribution";
import { loadScriptEnv } from "./lib/bootstrap";
import { and, asc, eq, gt, isNotNull } from "drizzle-orm";
import { worklogSyncs } from "../src/db/schema";

const BATCH_SIZE = 100;

async function backfill() {
  loadScriptEnv();
  const db = getDb();
  const attribution = createSyncAttributionService(db);
  let updated = 0;
  let scanned = 0;
  let lastId: string | null = null;

  for (;;) {
    const rows = await db
      .select({
        id: worklogSyncs.id,
        rawPayload: worklogSyncs.rawPayload,
        authorAccountId: worklogSyncs.authorAccountId,
        authorDisplayName: worklogSyncs.authorDisplayName,
        appUserId: worklogSyncs.appUserId,
      })
      .from(worklogSyncs)
      .where(
        lastId
          ? and(isNotNull(worklogSyncs.rawPayload), gt(worklogSyncs.id, lastId))
          : isNotNull(worklogSyncs.rawPayload),
      )
      .orderBy(asc(worklogSyncs.id))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;

    for (const row of rows) {
      lastId = row.id;
      scanned += 1;
      if (!row.rawPayload) continue;

      let payload: unknown;
      try {
        payload = JSON.parse(row.rawPayload);
      } catch {
        continue;
      }

      const event = parseWorklogWebhookPayload(payload);
      if (!event) continue;

      const authorAccountId =
        row.authorAccountId ?? event.authorAccountId ?? null;
      const authorDisplayName =
        row.authorDisplayName ?? event.authorDisplayName ?? null;
      const appUserId =
        row.appUserId ??
        (await attribution.resolveAppUserIdForAuthor(authorDisplayName));

      if (
        authorAccountId === row.authorAccountId &&
        authorDisplayName === row.authorDisplayName &&
        appUserId === row.appUserId
      ) {
        continue;
      }

      await db
        .update(worklogSyncs)
        .set({
          authorAccountId,
          authorDisplayName,
          appUserId,
          updatedAt: new Date(),
        })
        .where(eq(worklogSyncs.id, row.id));
      updated += 1;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`Backfill complete. Scanned ${scanned}, updated ${updated}.`);
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
