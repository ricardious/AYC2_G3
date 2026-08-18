"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { NODE_INFO } from "@/lib/smartegg/catalog";
import { FOREGROUND_MUTED } from "@/lib/smartegg/theme";
import type { CSSVars } from "@/lib/smartegg/types";
import { useSmartEgg } from "@/lib/state/hooks";

export function NodePanel() {
  const { config } = useSmartEgg();

  const rows = [
    ...NODE_INFO,
    { label: "TÉCNICO", value: config.technician, color: FOREGROUND_MUTED },
  ];

  return (
    <section aria-label="Nodo" className="w-[330px]">
      <SectionKicker>NODO</SectionKicker>
      <dl className="mt-[22px] font-mono text-[9px] leading-[2.6] tracking-[0.14em] text-neutral">
        {rows.map((row) => {
          const style: CSSVars = { "--value": row.color };
          return (
            <div key={row.label} className="flex justify-between" style={style}>
              <dt>{row.label}</dt>
              <dd className="m-0 text-[var(--value)]">{row.value}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
