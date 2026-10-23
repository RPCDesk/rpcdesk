import { Check } from "lucide-react";
import type { ThemeDefinition } from "../themes";

const SYSTEM_PREVIEW = { bg: "#f7f7f8", surface: "#1c1c1e", accent: "#0a84ff" };

function preview(theme: ThemeDefinition) {
  if (theme.appearance === "system") return SYSTEM_PREVIEW;
  return {
    bg: theme.tokens["--bg"] ?? SYSTEM_PREVIEW.bg,
    surface: theme.tokens["--surface-2"] ?? theme.tokens["--surface"] ?? SYSTEM_PREVIEW.surface,
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
        className="relative flex h-[44px] items-end gap-1 overflow-hidden rounded-md p-1.5"
        style={{ background: colors.bg }}
      >
        <span
          className="h-full w-[38%] rounded-sm"
          style={{ background: colors.surface }}
        />
        <span className="flex flex-1 flex-col gap-1 pb-0.5">
          <span
            className="h-1 w-full rounded-full opacity-70"
            style={{ background: colors.surface }}
          />
          <span
            className="h-1 w-[70%] rounded-full opacity-70"
            style={{ background: colors.surface }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full"
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
