import { STATION_META } from "@/lib/smartegg/catalog";
import type { CSSVars } from "@/lib/smartegg/types";

/** Riel izquierdo de incubación: identidad de la estación y avance del ciclo. */
export function StationSummary() {
  return (
    <div className="w-[130px] font-mono text-[8px] leading-[2.2] tracking-[0.16em] text-foreground-faint">
      {STATION_META.map((entry) => {
        const style: CSSVars = { "--value": entry.color };
        return (
          <div key={entry.label} className="not-first:mt-4" style={style}>
            <div>{entry.label}</div>
            <div className="text-[var(--value)]">{entry.value}</div>
          </div>
        );
      })}
    </div>
  );
}
