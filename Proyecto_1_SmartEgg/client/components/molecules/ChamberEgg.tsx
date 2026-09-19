import { EggShape } from "@/components/atoms/EggShape";
import { cx } from "@/lib/cx";
import { slotIndex } from "@/lib/smartegg/derive";
import type { EggView } from "@/lib/smartegg/types";

import { EggTooltip } from "./EggTooltip";

interface ChamberEggProps {
  egg: EggView;
  critical: boolean;
  onSelect: () => void;
  onHoverChange: (hovered: boolean) => void;
}

/** Espécimen sobre la bandeja, con su lectura al pasar el puntero. */
export function ChamberEgg({
  egg,
  critical,
  onSelect,
  onHoverChange,
}: ChamberEggProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      className="group relative flex w-[78px] flex-col items-center"
    >
      <EggShape
        variant="chamber"
        slot={slotIndex(egg.id)}
        empty={egg.empty}
        hot={egg.hot}
        critical={critical}
      />
      <span
        aria-hidden="true"
        className="rail-metal mt-[9px] h-[5px] w-[52px] border border-rule"
      />
      <span
        className={cx(
          "mt-[7px] font-mono text-[10px] tracking-[0.04em] whitespace-nowrap",
          egg.hot ? "text-foreground-bright" : "text-neutral",
        )}
      >
        {egg.label}
      </span>
      {egg.hovered ? <EggTooltip egg={egg} /> : null}
    </button>
  );
}
