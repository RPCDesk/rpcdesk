import { describe, expect, it } from "vitest";
import {
  BUILTIN_THEMES,
  REQUIRED_THEME_TOKENS,
  colorSchemeFor,
  type ThemeDefinition,
} from "./themes";

function hexToRgb(value: string): [number, number, number] | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return undefined;
  const number = Number.parseInt(match[1]!, 16);
  return [(number >> 16) & 0xff, (number >> 8) & 0xff, number & 0xff];
}

function luminance(value: string): number | undefined {
  const rgb = hexToRgb(value);
  if (!rgb) return undefined;
  const [r, g, b] = rgb.map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  expect(a, `${foreground} must be a hex color`).toBeDefined();
  expect(b, `${background} must be a hex color`).toBeDefined();
  const [light, dark] = a! > b! ? [a!, b!] : [b!, a!];
  return (light + 0.05) / (dark + 0.05);
}

const concrete = BUILTIN_THEMES.filter((theme) => theme.appearance !== "system");

describe("builtin themes", () => {
  it("keeps ids and names unique", () => {
    expect(new Set(BUILTIN_THEMES.map((theme) => theme.id)).size).toBe(
      BUILTIN_THEMES.length,
    );
    expect(new Set(BUILTIN_THEMES.map((theme) => theme.name)).size).toBe(
      BUILTIN_THEMES.length,
    );
  });

  it("offers a spread of dark and light palettes", () => {
    expect(BUILTIN_THEMES.filter((theme) => theme.appearance === "dark").length).toBeGreaterThanOrEqual(4);
    expect(BUILTIN_THEMES.filter((theme) => theme.appearance === "light").length).toBeGreaterThanOrEqual(3);
    expect(BUILTIN_THEMES.some((theme) => theme.appearance === "system")).toBe(true);
  });

  it("defines every required token", () => {
    for (const theme of concrete) {
      const missing = REQUIRED_THEME_TOKENS.filter(
        (token) => !(token in theme.tokens),
      );
      expect(missing, `${theme.id} is missing tokens`).toEqual([]);
    }
  });

  it("keeps text and accents readable", () => {
    for (const theme of concrete) {
      const bg = theme.tokens["--bg"]!;
      const surface = theme.tokens["--surface"]!;
      expect(
        contrast(theme.tokens["--fg"]!, bg),
        `${theme.id} fg on bg`,
      ).toBeGreaterThanOrEqual(7);
      expect(
        contrast(theme.tokens["--fg"]!, surface),
        `${theme.id} fg on surface`,
      ).toBeGreaterThanOrEqual(7);
      expect(
        contrast(theme.tokens["--muted"]!, bg),
        `${theme.id} muted on bg`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(theme.tokens["--accent"]!, bg),
        `${theme.id} accent on bg`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(theme.tokens["--error"]!, bg),
        `${theme.id} error on bg`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(theme.tokens["--on-accent"]!, theme.tokens["--accent"]!),
        `${theme.id} label on accent`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("orders surfaces the way the layout expects", () => {
    for (const theme of concrete) {
      const [bg, surface, surface2, surface3] = [
        "--bg",
        "--surface",
        "--surface-2",
        "--surface-3",
      ].map((token) => luminance(theme.tokens[token]!)!);
      if (theme.appearance === "dark") {
        // Raised surfaces get lighter as they stack.
        expect(surface, `${theme.id} surface > bg`).toBeGreaterThan(bg);
        expect(surface2, `${theme.id} surface-2 > surface`).toBeGreaterThan(surface);
        expect(surface3, `${theme.id} surface-3 > surface-2`).toBeGreaterThan(surface2);
      } else {
        // Cards sit above the page; inset surfaces are darker than the page.
        expect(surface, `${theme.id} surface >= bg`).toBeGreaterThanOrEqual(bg);
        expect(surface2, `${theme.id} surface-2 < surface`).toBeLessThan(surface);
        expect(surface3, `${theme.id} surface-3 < surface-2`).toBeLessThan(surface2);
        expect(bg, `${theme.id} bg > surface-3`).toBeGreaterThan(surface3);
      }
    }
  });
});

describe("colorSchemeFor", () => {
  const theme = (appearance: ThemeDefinition["appearance"]): ThemeDefinition => ({
    id: appearance,
    name: appearance,
    appearance,
    tokens: {},
  });

  it("follows the selected theme and the OS for system", () => {
    expect(colorSchemeFor(theme("system"))).toBe("light dark");
    expect(colorSchemeFor(theme("dark"))).toBe("dark");
    expect(colorSchemeFor(theme("light"))).toBe("light");
    expect(colorSchemeFor(undefined)).toBe("light dark");
  });
});
