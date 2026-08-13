import { describe, expect, it } from "vitest";
import {
  EXCLUDED_CLIENT_ID_THECURVE,
  ExcludedClientError,
  isExcludedClient,
  isExcludedClientId,
  isExcludedClientName,
  withoutExcludedClientProjects,
  withoutExcludedClientRows,
  withoutExcludedClients,
} from "@/lib/excluded-clients";

describe("excluded clients", () => {
  it("matches TheCurve by id and name", () => {
    expect(isExcludedClientId(EXCLUDED_CLIENT_ID_THECURVE)).toBe(true);
    expect(isExcludedClientName("TheCurve")).toBe(true);
    expect(isExcludedClientName(" thecurve ")).toBe(true);
    expect(
      isExcludedClient({
        id: EXCLUDED_CLIENT_ID_THECURVE,
        name: "Other",
      }),
    ).toBe(true);
    expect(isExcludedClient({ id: "other", name: "TheCurve" })).toBe(true);
  });

  it("does not match other clients", () => {
    expect(isExcludedClientId("client-1")).toBe(false);
    expect(isExcludedClientId(null)).toBe(false);
    expect(isExcludedClientName("Acme")).toBe(false);
    expect(isExcludedClient({ id: "c1", name: "Acme" })).toBe(false);
    expect(isExcludedClient(null)).toBe(false);
  });

  it("strips excluded clients, projects, and metric rows", () => {
    expect(
      withoutExcludedClients([
        { id: EXCLUDED_CLIENT_ID_THECURVE, name: "TheCurve" },
        { id: "c2", name: "Acme" },
      ]),
    ).toEqual([{ id: "c2", name: "Acme" }]);

    expect(
      withoutExcludedClientProjects([
        { id: "p1", client: { id: EXCLUDED_CLIENT_ID_THECURVE } },
        { id: "p2", client: { id: "c2", name: "Acme" } },
        { id: "p3", client: { id: "c3", name: "TheCurve" } },
      ]),
    ).toEqual([{ id: "p2", client: { id: "c2", name: "Acme" } }]);

    expect(
      withoutExcludedClientRows([
        { clientId: EXCLUDED_CLIENT_ID_THECURVE, clientName: "TheCurve" },
        { clientId: "c2", clientName: "Acme" },
      ]),
    ).toEqual([{ clientId: "c2", clientName: "Acme" }]);
  });

  it("is an Error subclass", () => {
    const err = new ExcludedClientError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ExcludedClientError");
  });
});
