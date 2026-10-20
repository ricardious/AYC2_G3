"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { TELEMETRY_GRID_PATH } from "@/lib/smartegg/geometry";
import { seriesPath } from "@/lib/smartegg/telemetry";
import { useTelemetry } from "@/lib/state/hooks";

const WIDTH = 496;
const HEIGHT = 132;
const PAD = 6;

/** Traza móvil de seis horas de temperatura y humedad. */
export function TelemetryChart() {
  const { series } = useTelemetry();

  const temperature = seriesPath(series, "t", 36.4, 41, WIDTH, HEIGHT, PAD);
  const humidity = seriesPath(series, "h", 44, 72, WIDTH, HEIGHT, PAD);

  return (
    <section
      aria-label="Historial de 6 horas"
      className="w-full max-w-[496px] console:w-[496px]"
    >
      <div className="flex items-baseline justify-between">
        <SectionKicker>HISTORIAL · 6 H</SectionKicker>
        <div className="flex gap-4 font-mono text-[11px] tracking-[0.1em]">
          <span className="text-warning">— TEMP</span>
          <span className="text-primary">— HUM</span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="mt-3 h-[132px] w-full overflow-visible console:w-[496px]"
      >
        <rect x="0" y="34" width={WIDTH} height="34" fill="var(--heat-band)" />
        <rect x="0" y="76" width={WIDTH} height="30" fill="var(--accent-band)" />
        <path
          d={TELEMETRY_GRID_PATH}
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth="1"
        />
        <path
          d={humidity}
          fill="none"
          strokeWidth="1"
          opacity=".85"
          className="stroke-primary"
        />
        <path
          d={temperature}
          fill="none"
          strokeWidth="1.2"
          className="stroke-warning drop-shadow-[0_0_6px_var(--heat-trace-glow)]"
        />
        <line
          x1={WIDTH}
          y1="0"
          x2={WIDTH}
          y2={HEIGHT}
          strokeWidth="1"
          className="stroke-hairline"
        />
      </svg>

      <div className="mt-2 flex justify-between font-mono text-[11px] tracking-[0.1em] text-foreground-fainter">
        <span>04:42</span>
        <span>07:42</span>
        <span>AHORA</span>
      </div>
    </section>
  );
}
