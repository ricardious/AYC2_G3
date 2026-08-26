"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { readHumidity } from "@/lib/smartegg/derive";
import {
  HUMIDITY_OPTIMAL_HEIGHT,
  HUMIDITY_OPTIMAL_TOP,
  humidityFillHeight,
} from "@/lib/smartegg/geometry";
import type { CSSVars } from "@/lib/smartegg/types";
import { useTelemetry } from "@/lib/state/hooks";

/** Columna graduada de humedad; marca la ventana óptima de 50–65 %. */
export function HumidityColumn() {
  const { latest } = useTelemetry();

  const humidity = readHumidity(latest);
  const style: CSSVars = {
    "--fill": `${humidityFillHeight(humidity ?? 0)}px`,
    "--optimal-top": `${HUMIDITY_OPTIMAL_TOP}px`,
    "--optimal-height": `${HUMIDITY_OPTIMAL_HEIGHT}px`,
  };

  return (
    <section
      aria-label="Humedad"
      className="flex items-end gap-5"
      style={style}
    >
      <div className="humidity-tube relative h-[212px] w-[34px] border border-primary/22">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-[var(--optimal-top)] h-[var(--optimal-height)] border-y border-dashed border-[var(--optimal-band-line)] bg-[var(--optimal-band-fill)]"
        />
        <span
          aria-hidden="true"
          className="humidity-fill absolute inset-x-0 bottom-0 h-[var(--fill)]"
        />
        <span
          aria-hidden="true"
          className="absolute -right-[5px] -left-[5px] bottom-[var(--fill)] h-px bg-primary shadow-[0_0_10px_var(--color-primary)]"
        />
        <span
          aria-hidden="true"
          className="humidity-graduations absolute inset-0"
        />
      </div>

      <div>
        <SectionKicker tone="cyan">HUMEDAD</SectionKicker>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <div className="text-[38px] leading-none font-light text-primary-soft">
            {humidity ?? "—"}
          </div>
          <div className="font-mono text-[11px] text-primary">%</div>
        </div>
        <div className="mt-3.5 font-mono text-[8px] leading-[1.9] tracking-[0.16em] text-foreground-faint">
          <div>RANGO ÓPTIMO</div>
          <div className="text-foreground-muted">50 — 65 %</div>
          <div className="mt-2.5">VAPOR · NEBULIZADOR</div>
          <div className="text-success">CICLO NORMAL</div>
        </div>
      </div>
    </section>
  );
}
