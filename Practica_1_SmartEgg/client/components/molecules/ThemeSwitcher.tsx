"use client";

import { cx } from "@/lib/cx";
import { useTheme, type Theme } from "@/lib/state/ThemeProvider";

const THEMES: Array<{ id: Theme; label: string; icon: "sun" | "system" | "moon" }> = [
  { id: "light", label: "Modo claro", icon: "sun" },
  { id: "system", label: "Usar tema del sistema", icon: "system" },
  { id: "dark", label: "Modo oscuro", icon: "moon" },
];

function ThemeIcon({ icon }: { icon: (typeof THEMES)[number]["icon"] }) {
  if (icon === "sun") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5" fill="none">
        <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.35 4.35l1.4 1.4m8.5 8.5 1.4 1.4m0-11.3-1.4 1.4m-8.5 8.5-1.4 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "moon") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5" fill="none">
        <path d="M15.8 12.7A6.5 6.5 0 0 1 7.3 4.2a6.5 6.5 0 1 0 8.5 8.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5" fill="none">
      <rect x="3" y="4" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 17h6m-3-3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Selector persistente: claro, preferencia del sistema u oscuro. */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Apariencia"
      className="flex w-fit items-center border border-divider-chip bg-panel/65 p-0.5 backdrop-blur-sm"
    >
      {THEMES.map((option) => {
        const active = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => setTheme(option.id)}
            className={cx(
              "flex size-8 items-center justify-center transition-colors console:size-7",
              active
                ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-primary)_28%,transparent)]"
                : "text-foreground-faint hover:bg-primary/8 hover:text-foreground-bright",
            )}
          >
            <ThemeIcon icon={option.icon} />
          </button>
        );
      })}
    </div>
  );
}
