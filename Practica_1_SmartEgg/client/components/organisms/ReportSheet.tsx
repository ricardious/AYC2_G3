"use client";

import { DataField } from "@/components/atoms/DataField";
import { REPORT_FIELDS } from "@/lib/smartegg/catalog";
import { HISTORY_SERIES, seriesPath } from "@/lib/smartegg/telemetry";
import { useOccupiedSlots, useSmartEgg } from "@/lib/state/hooks";

const sparkline = seriesPath(
  HISTORY_SERIES.slice(0, 120),
  "t",
  36.6,
  38.6,
  424,
  90,
  8,
);

/** El reporte generado, como una lámina inclinada. */
export function ReportSheet() {
  const { config } = useSmartEgg();
  const occupiedSlots = useOccupiedSlots();

  return (
    <article className="report-surface h-[660px] w-[520px] border border-[rgba(200,225,232,.28)] px-12 py-14 text-foreground-bright backdrop-blur-[3px] [transform:perspective(1600px)_rotateY(-14deg)_rotateX(4deg)_rotateZ(-1.5deg)]">
      <div className="font-mono text-[8px] tracking-[0.3em] text-primary">
        SMART EGG · SISTEMA IOT
      </div>
      <div className="mt-[18px] text-[26px] font-medium tracking-[0.04em]">
        REPORTE DE
        <br />
        INCUBACIÓN
      </div>
      <div
        aria-hidden="true"
        className="mt-3.5 h-px bg-[rgba(200,225,232,.4)]"
      />

      <div className="mt-[26px] flex flex-col gap-5">
        {REPORT_FIELDS.map((field) => (
          <DataField
            key={field.label}
            variant="lg"
            label={field.label}
            value={
              field.label === "HUEVOS ACTIVOS"
                ? String(occupiedSlots)
                : field.value
            }
          />
        ))}
      </div>

      <svg
        viewBox="0 0 424 90"
        aria-hidden="true"
        className="mt-[30px] h-[90px] w-[424px]"
      >
        <path
          d={sparkline}
          fill="none"
          stroke="rgba(95,227,232,.55)"
          strokeWidth="1"
        />
      </svg>

      <div className="mt-[26px] flex justify-between font-mono text-[7.5px] tracking-[0.14em] text-foreground-paper">
        <span>TÉCNICO · {config.technician}</span>
        <span>11 AGO 2026 · 10:42</span>
      </div>
    </article>
  );
}
