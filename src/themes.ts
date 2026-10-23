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
  "--on-accent",
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

/** Tokens every concrete theme must define (fonts and radius stay app defaults). */
export const REQUIRED_THEME_TOKENS = THEME_TOKENS.filter(
  (token) => token !== "--font-ui" && token !== "--font-mono" && token !== "--radius",
);

const lightTokens: Record<string, string> = {
  "--bg": "#f7f7f8",
  "--surface": "#ffffff",
  "--surface-2": "#f2f2f4",
  "--surface-3": "#e9e9ec",
  "--fg": "#1d1d1f",
  "--muted": "#6e6e73",
  "--border": "rgba(0, 0, 0, 0.1)",
  "--border-strong": "rgba(0, 0, 0, 0.18)",
  "--accent": "#0a6fd6",
  "--accent-soft": "rgba(10, 111, 214, 0.12)",
  "--on-accent": "#ffffff",
  "--success": "#248a3d",
  "--success-soft": "rgba(36, 138, 61, 0.12)",
  "--warning": "#b25000",
  "--warning-soft": "rgba(178, 80, 0, 0.12)",
  "--error": "#d70015",
  "--error-soft": "rgba(215, 0, 21, 0.1)",
  "--shadow-pop": "0 10px 40px rgba(0, 0, 0, 0.16)",
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
  "--on-accent": "#06121f",
  "--success": "#30d158",
  "--success-soft": "rgba(48, 209, 88, 0.14)",
  "--warning": "#ff9f0a",
  "--warning-soft": "rgba(255, 159, 10, 0.14)",
  "--error": "#ff453a",
  "--error-soft": "rgba(255, 69, 58, 0.14)",
  "--shadow-pop": "0 10px 40px rgba(0, 0, 0, 0.5)",
};


/**
 * Modern palettes. Each theme sets every visual token so switching themes never leaks
 * values from the previous one; fonts and radius stay with the app defaults unless a
 * theme overrides them.
 */
const graphiteTokens: Record<string, string> = {
  "--bg": "#111214",
  "--surface": "#17181b",
  "--surface-2": "#1d1f23",
  "--surface-3": "#26282d",
  "--fg": "#eceef2",
  "--muted": "#9aa1ab",
  "--border": "rgba(255, 255, 255, 0.08)",
  "--border-strong": "rgba(255, 255, 255, 0.16)",
  "--accent": "#8b8cf6",
  "--accent-soft": "rgba(139, 140, 246, 0.18)",
  "--on-accent": "#0c0b1a",
  "--success": "#4ade80",
  "--success-soft": "rgba(74, 222, 128, 0.14)",
  "--warning": "#fbbf24",
  "--warning-soft": "rgba(251, 191, 36, 0.14)",
  "--error": "#f87171",
  "--error-soft": "rgba(248, 113, 113, 0.14)",
  "--shadow-pop": "0 10px 40px rgba(0, 0, 0, 0.6)",
};

const midnightTokens: Record<string, string> = {
  "--bg": "#0b1220",
  "--surface": "#111a2b",
  "--surface-2": "#16213a",
  "--surface-3": "#1e2c49",
  "--fg": "#e6edf8",
  "--muted": "#8fa3bf",
  "--border": "rgba(148, 178, 220, 0.14)",
  "--border-strong": "rgba(148, 178, 220, 0.26)",
  "--accent": "#4f9dff",
  "--accent-soft": "rgba(79, 157, 255, 0.2)",
  "--on-accent": "#04101f",
  "--success": "#3ddc97",
  "--success-soft": "rgba(61, 220, 151, 0.14)",
  "--warning": "#ffc457",
  "--warning-soft": "rgba(255, 196, 87, 0.14)",
  "--error": "#ff6b81",
  "--error-soft": "rgba(255, 107, 129, 0.14)",
  "--shadow-pop": "0 12px 44px rgba(2, 8, 20, 0.7)",
};

const auroraTokens: Record<string, string> = {
  "--bg": "#0f1117",
  "--surface": "#151823",
  "--surface-2": "#1b1f2e",
  "--surface-3": "#242a3d",
  "--fg": "#e9ecf5",
  "--muted": "#98a2c0",
  "--border": "rgba(170, 186, 255, 0.12)",
  "--border-strong": "rgba(170, 186, 255, 0.24)",
  "--accent": "#7c9cff",
  "--accent-soft": "rgba(124, 156, 255, 0.18)",
  "--on-accent": "#080c1a",
  "--success": "#2fd4b4",
  "--success-soft": "rgba(47, 212, 180, 0.14)",
  "--warning": "#ffb86b",
  "--warning-soft": "rgba(255, 184, 107, 0.14)",
  "--error": "#ff7a9c",
  "--error-soft": "rgba(255, 122, 156, 0.14)",
  "--shadow-pop": "0 12px 44px rgba(4, 6, 16, 0.65)",
};

const andromedaTokens: Record<string, string> = {
  "--bg": "#23262e",
  "--surface": "#2a2e37",
  "--surface-2": "#313640",
  "--surface-3": "#3a4050",
  "--fg": "#d5ced9",
  "--muted": "#9aa0ad",
  "--border": "rgba(213, 206, 217, 0.12)",
  "--border-strong": "rgba(213, 206, 217, 0.22)",
  "--accent": "#00e8c6",
  "--accent-soft": "rgba(0, 232, 198, 0.16)",
  "--on-accent": "#07231f",
  "--success": "#96e072",
  "--success-soft": "rgba(150, 224, 114, 0.14)",
  "--warning": "#ffe66d",
  "--warning-soft": "rgba(255, 230, 109, 0.14)",
  "--error": "#f92672",
  "--error-soft": "rgba(249, 38, 114, 0.16)",
  "--shadow-pop": "0 12px 44px rgba(6, 8, 14, 0.7)",
};

const sandTokens: Record<string, string> = {
  "--bg": "#f6f1e8",
  "--surface": "#fffdf9",
  "--surface-2": "#f1ebe0",
  "--surface-3": "#e7dfd0",
  "--fg": "#2b2620",
  "--muted": "#6f665a",
  "--border": "rgba(60, 48, 34, 0.12)",
  "--border-strong": "rgba(60, 48, 34, 0.22)",
  "--accent": "#b4551f",
  "--accent-soft": "rgba(180, 85, 31, 0.12)",
  "--on-accent": "#ffffff",
  "--success": "#3f7d3a",
  "--success-soft": "rgba(63, 125, 58, 0.12)",
  "--warning": "#9a6b00",
  "--warning-soft": "rgba(154, 107, 0, 0.12)",
  "--error": "#b3261e",
  "--error-soft": "rgba(179, 38, 30, 0.1)",
  "--shadow-pop": "0 10px 34px rgba(70, 55, 35, 0.16)",
};

const mistTokens: Record<string, string> = {
  "--bg": "#eef2f6",
  "--surface": "#ffffff",
  "--surface-2": "#e7edf3",
  "--surface-3": "#dbe4ec",
  "--fg": "#16202b",
  "--muted": "#5b6b7c",
  "--border": "rgba(22, 32, 43, 0.1)",
  "--border-strong": "rgba(22, 32, 43, 0.2)",
  "--accent": "#0b7c8c",
  "--accent-soft": "rgba(11, 124, 140, 0.12)",
  "--on-accent": "#ffffff",
  "--success": "#1f7a4d",
  "--success-soft": "rgba(31, 122, 77, 0.12)",
  "--warning": "#a35a00",
  "--warning-soft": "rgba(163, 90, 0, 0.12)",
  "--error": "#c02637",
  "--error-soft": "rgba(192, 38, 55, 0.1)",
  "--shadow-pop": "0 10px 34px rgba(20, 35, 50, 0.16)",
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
  {
    id: "graphite",
    name: "Graphite",
    appearance: "dark",
    tokens: graphiteTokens,
    source: "builtin",
  },
  {
    id: "midnight",
    name: "Midnight",
    appearance: "dark",
    tokens: midnightTokens,
    source: "builtin",
  },
  {
    id: "aurora",
    name: "Aurora",
    appearance: "dark",
    tokens: auroraTokens,
    source: "builtin",
  },
  {
    id: "andromeda",
    name: "Andromeda",
    appearance: "dark",
    tokens: andromedaTokens,
    source: "builtin",
  },
  {
    id: "sand",
    name: "Sand",
    appearance: "light",
    tokens: sandTokens,
    source: "builtin",
  },
  {
    id: "mist",
    name: "Mist",
    appearance: "light",
    tokens: mistTokens,
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

/** Native controls follow the selected theme, not just the OS preference. */
export function colorSchemeFor(theme: ThemeDefinition | undefined): string {
  if (!theme || theme.appearance === "system") return "light dark";
  return theme.appearance;
}

export function applyTheme(
  themeId: string,
  themes: ThemeDefinition[],
): void {
  const root = document.documentElement;
  for (const token of THEME_TOKENS) root.style.removeProperty(token);
  const theme = themes.find((item) => item.id === themeId);
  root.style.colorScheme = colorSchemeFor(theme);
  if (!theme || theme.appearance === "system") return;
  for (const [token, value] of Object.entries(theme.tokens)) {
    if (token.startsWith("--")) root.style.setProperty(token, value);
  }
}
