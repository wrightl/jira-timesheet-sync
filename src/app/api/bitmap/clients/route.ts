import { NextRequest } from "next/server";
import type { BitmapClient } from "@/clients/bitmap-http";
import { requireAuth } from "@/lib/auth";
import {
  clientsCacheKey,
  createApiCacheService,
} from "@/services/api-cache";
import { createSettingsService } from "@/services/settings-service";

async function fetchClientsFromBitmap(): Promise<BitmapClient[]> {
  const settings = createSettingsService();
  const api = await settings.createConfiguredBitmapClient();

  const clients: BitmapClient[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await api.listClients({ name: "", page });
    clients.push(...(response.data ?? []));
    totalPages = Math.max(1, response.total_pages ?? 1);
    if (!response.next_page && page >= totalPages) break;
    page = response.next_page ?? page + 1;
    if (page > totalPages) break;
  }

  const withProjects = clients.filter(
    (c) => c.has_projects == null || c.has_projects === true,
  );
  withProjects.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  return withProjects;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const cache = createApiCacheService();
    const cacheKey = clientsCacheKey();

    if (refresh) {
      await cache.deleteByKey(cacheKey);
    } else {
      const cached = await cache.getCachedJson<BitmapClient[]>(cacheKey);
      if (cached) {
        return Response.json({ clients: cached, cached: true });
      }
    }

    const clients = await fetchClientsFromBitmap();
    try {
      await cache.setCachedJson({
        cacheKey,
        // Reuse existing enum value — Postgres may not have a dedicated "clients" label yet.
        resourceType: "projects",
        requestMeta: { kind: "clients", name: "", has_projects: true },
        responseBody: clients,
      });
    } catch (cacheErr) {
      console.error("[bitmap/clients] Failed to cache clients list", cacheErr);
    }

    return Response.json({ clients, cached: false });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load clients";
    return Response.json({ error: message }, { status: 502 });
  }
}
