"use client";

import { DataField } from "@/components/atoms/DataField";
import { SectionKicker } from "@/components/atoms/SectionKicker";
import { readTemperature } from "@/lib/smartegg/derive";
import {
  GAUGE_OPTIMAL_PATH,
  GAUGE_OUTLINE_PATH,
  GAUGE_TICKS_PATH,
  GAUGE_TRACK_PATH,
  gaugeDashArray,
  gaugeFraction,
  gaugeNeedle,
} from "@/lib/smartegg/geometry";
import { FOREGROUND_MUTED } from "@/lib/smartegg/theme";
import type { CSSVars } from "@/lib/smartegg/types";
import { useSmartEgg, useTelemetry } from "@/lib/state/hooks";

/** Termómetro de media esfera con la banda óptima de 37–38 °C. */
export function TemperatureGauge() {
  const { critical } = useSmartEgg();
  const { latest } = useTelemetry();

  const reading = readTemperature(latest, critical);
  const fraction = gaugeFraction(reading.value);
  const needle = gaugeNeedle(fraction);
  const style: CSSVars = { "--accent": reading.color };

  return (
    <section
      aria-label="Temperatura"
      className="w-full console:w-[290px]"
      style={style}
    >
      <SectionKicker tone="amber">TEMPERATURA</SectionKicker>

      {/* En pila el disco mide menos que la fila. Se centra junto con su
          lectura —que se posiciona respecto a él— mientras el rótulo y los
          campos se quedan en el margen, a la misma línea que el resto de los
          instrumentos. */}
      <div className="mx-auto w-[290px] console:mx-0">
        <svg
          viewBox="0 0 290 168"
          aria-hidden="true"
          className="mt-1.5 h-[168px] w-[290px] overflow-visible"
        >
          <path
            d={GAUGE_OUTLINE_PATH}
            fill="none"
            stroke="var(--gauge-outline)"
            strokeWidth="1"
          />
          <path
            d={GAUGE_TRACK_PATH}
            fill="none"
            stroke="var(--gauge-track)"
            strokeWidth="14"
          />
          <path
            d={GAUGE_OPTIMAL_PATH}
            fill="none"
            stroke="var(--gauge-optimal)"
            strokeWidth="14"
          />
          <path
            d={GAUGE_TRACK_PATH}
            fill="none"
            strokeWidth="2"
            strokeDasharray={gaugeDashArray(fraction)}
            className="stroke-[var(--accent)] text-[var(--accent)] drop-shadow-[0_0_8px_currentColor]"
          />
          <path
            d={GAUGE_TICKS_PATH}
            fill="none"
            stroke="var(--gauge-ticks)"
            strokeWidth="1"
          />
          <circle
            cx={needle.cx}
            cy={needle.cy}
            r="4"
            className="fill-[var(--accent)]"
          />
          <text
            x="26"
            y="166"
            className="fill-foreground-fainter font-mono text-[8px] tracking-[1px]"
          >
            35
          </text>
          <text
            x="252"
            y="166"
            className="fill-foreground-fainter font-mono text-[8px] tracking-[1px]"
          >
            41
          </text>
        </svg>

        <div className="-mt-[72px] ml-[82px] w-[126px] text-center">
          <div className="text-[44px] leading-none font-light tracking-[-0.01em] text-[var(--accent)]">
            {reading.label}
          </div>
          <div className="mt-1 font-mono text-[9px] tracking-[0.2em] text-neutral">
            °C
          </div>
        </div>
      </div>

      <div className="mt-[52px] flex gap-[26px]">
        <DataField
          label="RANGO ÓPTIMO"
          value="37 — 38 °C"
          valueColor={FOREGROUND_MUTED}
        />
        <DataField
          label="DESVIACIÓN"
          value={reading.deviation}
          valueColor={reading.color}
        />
      </div>
    </section>
  );
}
