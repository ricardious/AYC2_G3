import { SectionKicker } from "@/components/atoms/SectionKicker";
import { TIMELINE } from "@/lib/smartegg/catalog";
import { HISTORY_GRID_PATH } from "@/lib/smartegg/geometry";
import { HISTORY_SERIES, seriesPath } from "@/lib/smartegg/telemetry";
import type { CSSVars } from "@/lib/smartegg/types";

const temperaturePath = seriesPath(
  HISTORY_SERIES,
  "t",
  36.4,
  39.2,
  1440,
  180,
  10,
);
const humidityPath = seriesPath(HISTORY_SERIES, "h", 46, 70, 1440, 150, 10);

/** Trazas de 24 h de temperatura y humedad, con la línea de tiempo debajo. */
export function HistoryCharts() {
  return (
    <div>
      <SectionKicker tone="amber">TEMPERATURA · 24 H</SectionKicker>
      <svg
        viewBox="0 0 1440 180"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="mt-2.5 h-[180px] w-full"
      >
        <rect x="0" y="60" width="1440" height="52" fill="var(--heat-band)" />
        <path
          d={HISTORY_GRID_PATH}
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth="1"
        />
        <path
          d={temperaturePath}
          fill="none"
          strokeWidth="1.2"
          className="stroke-warning drop-shadow-[0_0_6px_var(--heat-trace-glow)]"
        />
      </svg>

      <SectionKicker tone="cyan" className="mt-[26px]">
        HUMEDAD · 24 H
      </SectionKicker>
      <svg
        viewBox="0 0 1440 150"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="mt-2.5 h-[150px] w-full"
      >
        <rect x="0" y="52" width="1440" height="46" fill="var(--accent-band)" />
        <path
          d={HISTORY_GRID_PATH}
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth="1"
        />
        <path
          d={humidityPath}
          fill="none"
          strokeWidth="1"
          className="stroke-primary"
        />
      </svg>

      <div className="relative mt-[34px] h-11">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-2.5 h-px bg-rule"
        />
        {TIMELINE.map((mark) => {
          const style: CSSVars = {
            left: `${mark.pct}%`,
            "--mark-height": `${mark.height}px`,
            "--mark-color": mark.color,
          };
          return (
            <div key={mark.label} className="absolute top-0" style={style}>
              <span
                aria-hidden="true"
                className="block h-[var(--mark-height)] w-px bg-[var(--mark-color)]"
              />
              <span className="mt-2 -ml-4 block w-8 text-center font-mono text-[7.5px] text-foreground-fainter">
                {mark.label}
              </span>
            </div>
          );
        })}
        <span
          aria-hidden="true"
          className="absolute top-[-8px] left-[82%] h-7 w-px bg-foreground-bright shadow-[0_0_12px_var(--playhead-glow)]"
        />
      </div>
    </div>
  );
}
