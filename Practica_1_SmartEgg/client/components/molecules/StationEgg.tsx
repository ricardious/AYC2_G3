import { EggShape } from "@/components/atoms/EggShape";
import { cx } from "@/lib/cx";
import type { CSSVars, EggView } from "@/lib/smartegg/types";

interface StationEggProps {
  egg: EggView;
  critical: boolean;
  onSelect: () => void;
  onHoverChange: (hovered: boolean) => void;
}

/** Espécimen a tamaño completo en la mesa de análisis. */
export function StationEgg({
  egg,
  critical,
  onSelect,
  onHoverChange,
}: StationEggProps) {
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
      className="group block w-[176px] text-center"
    >
      <span className="relative flex h-[170px] items-end justify-center">
        <span
          aria-hidden="true"
          className={cx(
            "bench-pad absolute bottom-0 left-1/2 -ml-[56px] h-[26px] w-[112px] rounded-[50%] border transition-colors group-hover:border-primary",
            egg.hot ? "border-primary" : "border-divider-chip",
          )}
        />
        <EggShape
          variant="station"
          empty={egg.empty}
          hot={egg.hot}
          critical={critical}
          className="mb-3"
        />
      </span>

      <span className="mt-[18px] block font-mono text-[9px] leading-[2.1] tracking-[0.18em] text-neutral">
        <span className="block font-display text-sm tracking-[0.14em] text-foreground-bright">
          {egg.label}
        </span>
        <span className="block">{egg.line2}</span>
        <span className="block text-[var(--state)]">{egg.line3}</span>
      </span>
    </button>
  );
}
