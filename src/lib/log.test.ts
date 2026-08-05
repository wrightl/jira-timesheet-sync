import { afterEach, describe, expect, it, vi } from "vitest";
import { getLogLevel, log } from "@/lib/log";

describe("log", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("defaults to debug outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOG_LEVEL", "");
    expect(getLogLevel()).toBe("debug");
  });

  it("defaults to info in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOG_LEVEL", "");
    expect(getLogLevel()).toBe("info");
  });

  it("respects LOG_LEVEL override", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOG_LEVEL", "warn");
    expect(getLogLevel()).toBe("warn");
  });

  it("filters below configured level", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOG_LEVEL", "warn");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    log.debug("test", "skip");
    log.info("test", "skip");
    log.warn("test", "keep", { reason: "no_mapping" });

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("WARN [test] keep");
    expect(String(warn.mock.calls[0]?.[0])).toContain("reason=no_mapping");
  });

  it("emits JSON lines in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOG_LEVEL", "info");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    log.info("worklog-sync", "synced", { worklogId: "123" });

    expect(info).toHaveBeenCalledOnce();
    const parsed = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<
      string,
      unknown
    >;
    expect(parsed).toMatchObject({
      level: "info",
      scope: "worklog-sync",
      message: "synced",
      worklogId: "123",
    });
    expect(typeof parsed.ts).toBe("string");
  });
});
