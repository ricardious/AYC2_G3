import type { CSSVars, SetpointView } from "@/lib/smartegg/types";

/** Lectura de calibración (sólo lectura) de un lazo de control. */
export function SetpointSlider({
  label,
  value,
  pct,
  color,
  hint,
}: SetpointView) {
  const style: CSSVars = { "--accent": color, "--pct": `${pct}%` };

  return (
    <div style={style}>
      <div className="flex justify-between font-mono text-[9px] tracking-[0.16em] text-neutral">
        <span>{label}</span>
        <span className="text-[var(--accent)]">{value}</span>
      </div>

      <div className="relative mt-3 h-px bg-rule">
        <span className="absolute top-0 left-0 h-px w-[var(--pct)] bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
        <span className="absolute top-[-4px] left-[var(--pct)] -ml-1 size-[9px] border border-[var(--accent)] bg-[#06080b]" />
      </div>

      <div className="mt-[9px] font-mono text-[7.5px] tracking-[0.14em] text-foreground-fainter">
        {hint}
      </div>
    </div>
  );
}
