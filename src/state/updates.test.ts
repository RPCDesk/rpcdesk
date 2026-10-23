import { describe, expect, it } from "vitest";
import {
  formatProgress,
  shouldCheckForUpdates,
  shouldInstallAutomatically,
  updateSummary,
} from "./updates";

describe("update modes", () => {
  it("only checks when checking is enabled", () => {
    expect(shouldCheckForUpdates("off")).toBe(false);
    expect(shouldCheckForUpdates("notify")).toBe(true);
    expect(shouldCheckForUpdates("auto")).toBe(true);
  });

  it("installs without asking only in auto mode", () => {
    expect(shouldInstallAutomatically("off")).toBe(false);
    expect(shouldInstallAutomatically("notify")).toBe(false);
    expect(shouldInstallAutomatically("auto")).toBe(true);
  });
});

describe("updateSummary", () => {
  it("describes each state", () => {
    expect(updateSummary("idle", undefined, undefined, "1.0.0")).toBe(
      "Not checked yet.",
    );
    expect(updateSummary("up-to-date", undefined, undefined, "1.0.0")).toBe(
      "rpcdesk 1.0.0 is up to date.",
    );
    expect(
      updateSummary(
        "available",
        { version: "1.1.0", currentVersion: "1.0.0" },
        undefined,
        "1.0.0",
      ),
    ).toBe("Version 1.1.0 is available (you have 1.0.0).");
    expect(
      updateSummary(
        "downloading",
        { version: "1.1.0", currentVersion: "1.0.0" },
        { chunk: 5 * 1024 * 1024, total: 10 * 1024 * 1024 },
        "1.0.0",
      ),
    ).toBe("Downloading 1.1.0 — 5 / 10 MB");
  });
});

describe("formatProgress", () => {
  it("handles unknown totals and missing progress", () => {
    expect(formatProgress(undefined)).toBe("Downloading…");
    expect(formatProgress({ chunk: 2 * 1024 * 1024, total: null })).toBe("2 MB");
    expect(formatProgress({ chunk: 1024 * 1024, total: 4 * 1024 * 1024 })).toBe(
      "1 / 4 MB",
    );
  });
});
