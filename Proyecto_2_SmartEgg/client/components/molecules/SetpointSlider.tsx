import type { CSSVars } from "@/lib/smartegg/types";

interface SecondaryControl {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

interface SetpointSliderProps {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  color: string;
  hint?: string;
  secondary?: SecondaryControl;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function numericValue(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Control editable con lectura numérica y ajuste fino mediante rango. */
export function SetpointSlider({
  label,
  value,
  suffix,
  min,
  max,
  step,
  color,
  hint,
  secondary,
  disabled = false,
  onChange,
}: SetpointSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const style: CSSVars = {
    "--accent": color,
    "--pct": `${Math.max(0, Math.min(100, pct))}%`,
  };

  return (
    <div style={style} className={disabled ? "opacity-45" : undefined}>
      <div className="flex items-center justify-between gap-4 font-mono text-[11px] tracking-[0.13em] text-neutral">
        <label>{label}</label>
        <label className="flex items-baseline gap-1 border-b border-[var(--accent)]/35 pb-0.5 text-[var(--accent)] transition-colors focus-within:border-[var(--accent)]">
          <input
            aria-label={label}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(event) =>
              onChange(numericValue(event.target.value, value))
            }
            className="w-[54px] bg-transparent text-right text-[12px] font-semibold tracking-normal tabular-nums outline-none disabled:cursor-not-allowed"
          />
          <span className="text-[11px]">{suffix}</span>
        </label>
      </div>

      <div className="relative mt-3 h-[9px]">
        <span className="pointer-events-none absolute top-1/2 left-0 h-px w-full -translate-y-1/2 bg-rule" />
        <span className="pointer-events-none absolute top-1/2 left-0 h-px w-[var(--pct)] -translate-y-1/2 bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
        <input
          aria-label={`Ajustar ${label.toLowerCase()}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 h-[9px] w-full cursor-ew-resize appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
        />
        <span className="pointer-events-none absolute top-0 left-[var(--pct)] -ml-1 size-[9px] border border-[var(--accent)] bg-background shadow-[0_0_8px_var(--accent)]" />
      </div>

      <div className="mt-[7px] flex min-h-5 items-center justify-between font-mono text-[10px] tracking-[0.11em] text-foreground-fainter">
        {secondary ? (
          <>
            <span>{secondary.label}</span>
            <label className="flex items-baseline gap-1 text-foreground-muted focus-within:text-[var(--accent)]">
              <input
                aria-label={`${label}: ${secondary.label}`}
                type="number"
                min={secondary.min}
                max={secondary.max}
                step={secondary.step}
                value={secondary.value}
                disabled={disabled}
                onChange={(event) =>
                  secondary.onChange(
                    numericValue(event.target.value, secondary.value),
                  )
                }
                className="w-[44px] border-b border-rule bg-transparent text-right text-[11px] tabular-nums outline-none transition-colors focus:border-[var(--accent)] disabled:cursor-not-allowed"
              />
              <span>{secondary.suffix}</span>
            </label>
          </>
        ) : (
          <span>{hint}</span>
        )}
      </div>
    </div>
  );
}
