"use client";

import { DetailRowItem } from "@/components/molecules/DetailRowItem";
import { buildSelectionDetail } from "@/lib/smartegg/derive";
import type { CSSVars } from "@/lib/smartegg/types";
import { useOccupiedSlots, useSmartEgg } from "@/lib/state/hooks";

/**
 * Inspector del elemento seleccionado: un actuador, un sensor, un espécimen o
 * un espacio libre. Panel derecho en el plano, hoja inferior fija en la pila.
 */
export function SelectionPanel() {
  const { selection, critical, eggs, lots, actions } = useSmartEgg();
  const occupiedSlots = useOccupiedSlots();
  const detail = buildSelectionDetail(
    selection,
    critical,
    occupiedSlots,
    eggs,
    lots,
  );

  if (!detail) return null;

  const style: CSSVars = { "--accent": detail.accent };

  return (
    <aside
      aria-label={`Detalle · ${detail.title}`}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-primary/28 bg-panel px-5 pt-5 pb-7 shadow-[0_-30px_80px_-30px_#000] console:absolute console:inset-x-auto console:top-[118px] console:right-10 console:bottom-auto console:w-[318px] console:border console:px-6 console:pt-6 console:shadow-[-30px_0_80px_-30px_#000]"
    >
      <div className="flex items-start justify-between">
        <div>
          <div
            className="font-mono text-[8px] tracking-[0.26em] text-[var(--accent)]"
            style={style}
          >
            {detail.kicker}
          </div>
          <div className="mt-[9px] text-[22px] tracking-[0.08em]">
            {detail.title}
          </div>
        </div>
        <button
          type="button"
          aria-label="Cerrar detalle"
          onClick={actions.clearSelection}
          className="px-1.5 py-0.5 font-mono text-[11px] text-foreground-faint transition-colors hover:text-foreground-bright"
        >
          ×
        </button>
      </div>

      <div className="mt-[22px] grid grid-cols-2 gap-x-6 gap-y-[15px] console:flex console:flex-col console:gap-[15px]">
        {detail.rows.map((row) => (
          <DetailRowItem key={row.label} {...row} />
        ))}
      </div>
    </aside>
  );
}
