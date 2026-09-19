import type { CSSVars, DetailRow } from "@/lib/smartegg/types";

export function DetailRowItem({ label, value, color }: DetailRow) {
  const style: CSSVars = { "--accent": color };

  return (
    <div className="flex items-baseline justify-between gap-3.5 border-b border-divider-soft pb-[13px]">
      <span className="font-mono text-[11px] tracking-[0.15em] text-foreground-faint">
        {label}
      </span>
      <span
        className="text-right font-mono text-[12px] tracking-[0.08em] text-[var(--accent)]"
        style={style}
      >
        {value}
      </span>
    </div>
  );
}
