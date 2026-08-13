/** Bitmap internal client that must not appear in app metrics or dropdowns. */
export const EXCLUDED_CLIENT_ID_THECURVE = "5e8f8b80d9f37277a88e7f10";

export const EXCLUDED_CLIENT_IDS: ReadonlySet<string> = new Set([
  EXCLUDED_CLIENT_ID_THECURVE,
]);

const EXCLUDED_CLIENT_NAMES = new Set(["thecurve"]);

export class ExcludedClientError extends Error {
  constructor(message = "This client is excluded from the app") {
    super(message);
    this.name = "ExcludedClientError";
  }
}

export function isExcludedClientId(
  clientId: string | null | undefined,
): boolean {
  return Boolean(clientId && EXCLUDED_CLIENT_IDS.has(clientId));
}

export function isExcludedClientName(
  name: string | null | undefined,
): boolean {
  if (!name) return false;
  return EXCLUDED_CLIENT_NAMES.has(name.trim().toLowerCase());
}

export function isExcludedClient(
  client:
    | { id?: string | null; name?: string | null }
    | null
    | undefined,
): boolean {
  if (!client) return false;
  return isExcludedClientId(client.id) || isExcludedClientName(client.name);
}

export function withoutExcludedClients<
  T extends { id: string; name?: string | null },
>(clients: readonly T[]): T[] {
  return clients.filter((client) => !isExcludedClient(client));
}

export function withoutExcludedClientProjects<
  T extends {
    client?: { id?: string | null; name?: string | null } | null;
  },
>(projects: readonly T[]): T[] {
  return projects.filter((project) => !isExcludedClient(project.client));
}

export function withoutExcludedClientRows<
  T extends { clientId?: string | null; clientName?: string | null },
>(rows: readonly T[]): T[] {
  return rows.filter(
    (row) =>
      !isExcludedClientId(row.clientId) &&
      !isExcludedClientName(row.clientName),
  );
}
