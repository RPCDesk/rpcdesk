import { describe, expect, it } from "vitest";
import { appearanceLabel, nextAppearance } from "./appearance";

describe("appearance cycling", () => {
  it("walks system → light → dark → system", () => {
    expect(nextAppearance("system")).toBe("light");
    expect(nextAppearance("light")).toBe("dark");
    expect(nextAppearance("dark")).toBe("system");
  });

  it("returns named palettes to system instead of guessing a counterpart", () => {
    expect(nextAppearance("graphite")).toBe("system");
    expect(nextAppearance("sand")).toBe("system");
    expect(nextAppearance("hello-sunrise")).toBe("system");
  });

  it("labels known modes and flags palettes", () => {
    expect(appearanceLabel("system")).toBe("system");
    expect(appearanceLabel("light")).toBe("light");
    expect(appearanceLabel("dark")).toBe("dark");
    expect(appearanceLabel("aurora")).toBe("custom");
  });
});
