import { EggShape } from "@/components/atoms/EggShape";
import { cx } from "@/lib/cx";
import type { CSSVars, EggView } from "@/lib/smartegg/types";

interface EggChipProps {
  egg: EggView;
  critical: boolean;
  onSelect: () => void;
  onHoverChange: (hovered: boolean) => void;
}

/** Ficha compacta del espécimen para la tira inferior. */
export function EggChip({
  egg,
  critical,
  onSelect,
  onHoverChange,
}: EggChipProps) {
  const style: CSSVars = { "--state": egg.stateColor };

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      style={style}
      className={cx(
        "block w-full border-t pt-3 transition-colors hover:border-t-primary console:w-[88px]",
        egg.hot ? "border-t-primary" : "border-t-divider-chip",
      )}
    >
      <span className="flex h-[52px] items-end">
        <EggShape
          variant="chip"
          empty={egg.empty}
          hot={egg.hot}
          critical={critical}
        />
      </span>
      <span
        className={cx(
          "mt-2.5 block font-mono text-[8px] leading-[1.9] tracking-[0.12em]",
          egg.hot ? "text-foreground-bright" : "text-neutral",
        )}
      >
        <span className="block text-[9px] text-foreground">{egg.label}</span>
        <span className="block">{egg.line2}</span>
        <span className="block text-[var(--state)]">{egg.line3}</span>
      </span>
    </button>
  );
}
