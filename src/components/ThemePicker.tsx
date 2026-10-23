import { Check } from "lucide-react";
import type { ThemeDefinition } from "../themes";

const SYSTEM_PREVIEW = {
  bg: "#f3f4f7",
  panel: "#eaedf2",
  line: "rgba(22, 24, 29, 0.28)",
  accent: "#0a6fd6",
};

function preview(theme: ThemeDefinition) {
  if (theme.appearance === "system") return SYSTEM_PREVIEW;
  const bg = theme.tokens["--bg"] ?? SYSTEM_PREVIEW.bg;
  const panel = theme.tokens["--surface-2"] ?? theme.tokens["--surface"] ?? SYSTEM_PREVIEW.panel;
  const fg = theme.tokens["--fg"] ?? "#16181d";
  return {
    bg,
    panel,
    // Lines borrow the foreground so they read on both light and dark previews.
    line: `color-mix(in srgb, ${fg} 32%, transparent)`,
    accent: theme.tokens["--accent"] ?? SYSTEM_PREVIEW.accent,
  };
}

export function ThemeSwatch({
  theme,
  selected,
  onSelect,
}: {
  theme: ThemeDefinition;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const colors = preview(theme);
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={theme.name}
      onClick={() => onSelect(theme.id)}
      className={`group flex w-[92px] flex-col items-stretch gap-1 rounded-lg border p-1 text-left transition ${
        selected
          ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      <span
        className="relative flex h-[46px] items-stretch gap-1.5 overflow-hidden rounded-md p-1.5"
        style={{ background: colors.bg }}
      >
        <span
          className="w-[32%] rounded-[4px]"
          style={{ background: colors.panel }}
        />
        <span className="flex flex-1 flex-col justify-center gap-1">
          <span
            className="h-[3px] w-[86%] rounded-full"
            style={{ background: colors.line }}
          />
          <span
            className="h-[3px] w-[58%] rounded-full"
            style={{ background: colors.line }}
          />
          <span
            className="mt-0.5 h-2 w-5 rounded-full"
            style={{ background: colors.accent }}
          />
        </span>
        {selected ? (
          <span className="absolute right-1 top-1 rounded-full bg-[var(--accent)] p-[2px] text-[var(--on-accent)]">
            <Check size={9} strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="truncate px-0.5 text-[10px] text-[var(--muted)] group-hover:text-[var(--fg)]">
        {theme.name}
      </span>
    </button>
  );
}

export function ThemePicker({
  value,
  themes,
  onChange,
}: {
  value: string;
  themes: ThemeDefinition[];
  onChange: (id: string) => void;
}) {
  const ordered = [
    ...themes.filter((theme) => theme.appearance === "system"),
    ...themes.filter((theme) => theme.appearance === "dark"),
    ...themes.filter((theme) => theme.appearance === "light"),
  ];
  return (
    <div className="flex flex-wrap gap-1.5 py-2">
      {ordered.map((theme) => (
        <ThemeSwatch
          key={theme.id}
          theme={theme}
          selected={theme.id === value}
          onSelect={onChange}
        />
      ))}
    </div>
  );
}
