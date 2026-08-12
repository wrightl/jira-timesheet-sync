/**
 * Local Neon HTTP proxy for development.
 *
 * The app talks to Postgres through the Neon serverless HTTP driver
 * (`@neondatabase/serverless` + `drizzle-orm/neon-http`). In production that
 * driver POSTs SQL to Neon's `/sql` endpoint. This tiny server implements the
 * same HTTP contract on top of a plain PostgreSQL server so the whole app can
 * run locally with no Neon Cloud account.
 *
 * Point the driver at it by setting `NEON_LOCAL_FETCH_ENDPOINT` (see
 * `src/db/index.ts`). The proxy connects to the database given by
 * `NEON_PROXY_DATABASE_URL` (falls back to `DATABASE_URL_UNPOOLED` /
 * `DATABASE_URL`).
 */
import http from "node:http";
import pg from "pg";

const PORT = Number(process.env.NEON_PROXY_PORT ?? 4444);
const TARGET =
  process.env.NEON_PROXY_DATABASE_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.DATABASE_URL;

if (!TARGET) {
  console.error(
    "[neon-proxy] No target database. Set NEON_PROXY_DATABASE_URL, DATABASE_URL_UNPOOLED, or DATABASE_URL.",
  );
  process.exit(1);
}

// Return every column value as its raw Postgres text representation (or null),
// exactly like Neon's HTTP endpoint with `Neon-Raw-Text-Output: true`. The
// serverless driver re-parses these strings client-side.
const rawTextTypes = { getTypeParser: () => (value) => value };

const pool = new pg.Pool({ connectionString: TARGET, max: 10 });

// pg error fields forwarded verbatim so the driver can reconstruct a NeonDbError.
const PG_ERROR_FIELDS = [
  "severity",
  "code",
  "detail",
  "hint",
  "position",
  "internalPosition",
  "internalQuery",
  "where",
  "schema",
  "table",
  "column",
  "dataType",
  "constraint",
  "file",
  "line",
  "routine",
];

async function runQuery({ query, params }) {
  const result = await pool.query({
    text: query,
    values: params ?? [],
    rowMode: "array",
    types: rawTextTypes,
  });
  return {
    command: result.command,
    rowCount: result.rowCount,
    rows: result.rows,
    fields: (result.fields ?? []).map((f) => ({
      name: f.name,
      dataTypeID: f.dataTypeID,
      tableID: f.tableID,
      columnID: f.columnID,
      dataTypeSize: f.dataTypeSize,
      dataTypeModifier: f.dataTypeModifier,
      format: f.format,
    })),
    rowAsArray: true,
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function serializeError(err) {
  const body = { message: err.message };
  for (const field of PG_ERROR_FIELDS) {
    if (err[field] !== undefined) body[field] = err[field];
  }
  return body;
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Only POST is supported" });
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", async () => {
    let parsed;
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      sendJson(res, 400, { message: "Invalid JSON body" });
      return;
    }

    try {
      // Batch form: { queries: [{ query, params }, ...] }
      if (Array.isArray(parsed.queries)) {
        const results = [];
        for (const q of parsed.queries) {
          results.push(await runQuery(q));
        }
        sendJson(res, 200, { results });
        return;
      }
      // Single query form: { query, params }
      sendJson(res, 200, await runQuery(parsed));
    } catch (err) {
      sendJson(res, 400, serializeError(err));
    }
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `[neon-proxy] listening on http://127.0.0.1:${PORT}/sql -> ${TARGET.replace(/:[^:@/]*@/, ":****@")}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    pool.end().finally(() => process.exit(0));
  });
}
