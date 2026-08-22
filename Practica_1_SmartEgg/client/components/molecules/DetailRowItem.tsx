import type { CSSVars, DetailRow } from "@/lib/smartegg/types";

export function DetailRowItem({ label, value, color }: DetailRow) {
  const style: CSSVars = { "--accent": color };

  return (
    <div className="flex items-baseline justify-between gap-3.5 border-b border-divider-soft pb-[13px]">
      <span className="font-mono text-[8px] tracking-[0.2em] text-foreground-faint">
        {label}
      </span>
      <span
        className="text-right font-mono text-[10px] tracking-[0.1em] text-[var(--accent)]"
        style={style}
      >
        {value}
      </span>
    </div>
  );
}
