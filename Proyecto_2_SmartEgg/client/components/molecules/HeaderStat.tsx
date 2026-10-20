import { StatusDot } from "@/components/atoms/StatusDot";
import type {
  CSSVars,
  HeaderStat as HeaderStatModel,
} from "@/lib/smartegg/types";

export function HeaderStat({ label, value, color, dot }: HeaderStatModel) {
  const style: CSSVars = { "--stat": color };

  return (
    <div className="min-w-[76px]">
      <div className="font-mono text-[11px] tracking-[0.15em] text-foreground-faint">
        {label}
      </div>
      <div
        className="mt-1.5 flex items-center gap-1.5 font-mono text-[12px] tracking-[0.09em] text-[var(--stat)]"
        style={style}
      >
        <StatusDot size={5} color={dot} glow={8} />
        {value}
      </div>
    </div>
  );
}
