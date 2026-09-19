"use client";

import { STATION_META } from "@/lib/smartegg/catalog";
import { EGG_SLOT_COUNT } from "@/lib/smartegg/derive";
import type { CSSVars } from "@/lib/smartegg/types";
import { useOccupiedSlots } from "@/lib/state/hooks";

/** Riel izquierdo de incubación: identidad de la estación y avance del ciclo. */
export function StationSummary() {
  const occupiedSlots = useOccupiedSlots();

  return (
    <div className="w-[130px] font-mono text-[11px] leading-[2.2] tracking-[0.12em] text-foreground-faint">
      {STATION_META.map((entry) => {
        const style: CSSVars = { "--value": entry.color };
        return (
          <div key={entry.label} className="not-first:mt-4" style={style}>
            <div>{entry.label}</div>
            <div className="text-[var(--value)]">
              {entry.label === "OCUPACIÓN"
                ? `${occupiedSlots} / ${EGG_SLOT_COUNT}`
                : entry.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
