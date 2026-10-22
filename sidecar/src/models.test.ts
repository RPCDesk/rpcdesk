import { describe, expect, it } from "vitest";
import { usableModel } from "./models";

describe("usableModel", () => {
  it("rejects missing and placeholder models", () => {
    expect(usableModel(undefined)).toBe(false);
    expect(usableModel(null)).toBe(false);
    expect(usableModel({})).toBe(false);
    expect(usableModel({ provider: "unknown", id: "unknown" })).toBe(false);
    expect(usableModel({ provider: "opencode-go", id: "" })).toBe(false);
  });

  it("accepts a concrete provider and model", () => {
    expect(
      usableModel({ provider: "opencode-go", id: "deepseek-v4.1-flash" }),
    ).toBe(true);
  });
});
