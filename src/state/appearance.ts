export type AppearanceMode = "system" | "light" | "dark";

export const APPEARANCE_CYCLE: readonly AppearanceMode[] = ["system", "light", "dark"];

/** The label shown next to the appearance control for any theme id. */
export function appearanceLabel(theme: string): AppearanceMode | "custom" {
  return (APPEARANCE_CYCLE as readonly string[]).includes(theme)
    ? (theme as AppearanceMode)
    : "custom";
}

/**
 * Next theme id when the appearance button is pressed.
 *
 * system → light → dark → system. A named palette (Graphite, Sand, ...) is not part of
 * the cycle, so its first press returns to system rather than guessing a counterpart.
 */
export function nextAppearance(theme: string): AppearanceMode {
  const current = appearanceLabel(theme);
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}
