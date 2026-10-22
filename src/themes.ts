import { create } from "zustand";
import { call } from "./lib/tauri";

export interface ThemeDefinition {
  id: string;
  name: string;
  appearance: "system" | "light" | "dark";
  tokens: Record<string, string>;
  source?: "builtin" | "user";
}

export const THEME_TOKENS = [
  "--bg",
  "--surface",
  "--surface-2",
  "--surface-3",
  "--fg",
  "--muted",
  "--border",
  "--border-strong",
  "--accent",
  "--accent-soft",
  "--success",
  "--success-soft",
  "--warning",
  "--warning-soft",
  "--error",
  "--error-soft",
  "--radius",
  "--font-ui",
  "--font-mono",
  "--shadow-pop",
] as const;

const lightTokens: Record<string, string> = {
  "--bg": "#f7f7f8",
  "--surface": "#ffffff",
  "--surface-2": "#f2f2f4",
  "--surface-3": "#e9e9ec",
  "--fg": "#1d1d1f",
  "--muted": "#6e6e73",
  "--border": "rgba(0, 0, 0, 0.1)",
  "--border-strong": "rgba(0, 0, 0, 0.18)",
  "--accent": "#0a84ff",
  "--accent-soft": "rgba(10, 132, 255, 0.12)",
  "--success": "#248a3d",
  "--success-soft": "rgba(36, 138, 61, 0.12)",
  "--warning": "#b25000",
  "--warning-soft": "rgba(178, 80, 0, 0.12)",
  "--error": "#d70015",
  "--error-soft": "rgba(215, 0, 21, 0.1)",
};

const darkTokens: Record<string, string> = {
  "--bg": "#1c1c1e",
  "--surface": "#242426",
  "--surface-2": "#2c2c2e",
  "--surface-3": "#363638",
  "--fg": "#f5f5f7",
  "--muted": "#a1a1a6",
  "--border": "rgba(255, 255, 255, 0.1)",
  "--border-strong": "rgba(255, 255, 255, 0.18)",
  "--accent": "#0a84ff",
  "--accent-soft": "rgba(10, 132, 255, 0.2)",
  "--success": "#30d158",
  "--success-soft": "rgba(48, 209, 88, 0.14)",
  "--warning": "#ff9f0a",
  "--warning-soft": "rgba(255, 159, 10, 0.14)",
  "--error": "#ff453a",
  "--error-soft": "rgba(255, 69, 58, 0.14)",
};

export const BUILTIN_THEMES: ThemeDefinition[] = [
  {
    id: "system",
    name: "System",
    appearance: "system",
    tokens: {},
    source: "builtin",
  },
  {
    id: "light",
    name: "Light",
    appearance: "light",
    tokens: lightTokens,
    source: "builtin",
  },
  {
    id: "dark",
    name: "Dark",
    appearance: "dark",
    tokens: darkTokens,
    source: "builtin",
  },
];

interface ThemesStore {
  themes: ThemeDefinition[];
  load: () => Promise<void>;
  register: (theme: ThemeDefinition) => void;
}

export const useThemes = create<ThemesStore>((set, get) => ({
  themes: BUILTIN_THEMES,
  async load() {
    try {
      const userThemes = await call<
        Array<{
          id: string;
          name: string;
          appearance: "light" | "dark";
          tokens: Record<string, string>;
          source: "user";
        }>
      >("list_themes");
      const registered = get().themes.filter((theme) => theme.source !== "user");
      set({
        themes: [
          ...registered,
          ...userThemes.map((theme) => ({ ...theme, source: "user" as const })),
        ],
      });
    } catch (error) {
      console.error("Failed to load themes", error);
    }
  },
  register(theme) {
    const existing = get().themes.filter((item) => item.id !== theme.id);
    set({ themes: [...existing, theme] });
  },
}));

export function applyTheme(
  themeId: string,
  themes: ThemeDefinition[],
): void {
  const root = document.documentElement;
  for (const token of THEME_TOKENS) root.style.removeProperty(token);
  if (themeId === "system") return;
  const theme = themes.find((item) => item.id === themeId);
  if (!theme) return;
  for (const [token, value] of Object.entries(theme.tokens)) {
    if (token.startsWith("--")) root.style.setProperty(token, value);
  }
}
