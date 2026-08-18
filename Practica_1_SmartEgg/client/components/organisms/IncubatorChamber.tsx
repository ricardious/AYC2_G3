"use client";

import { ChamberEgg } from "@/components/molecules/ChamberEgg";
import { ComponentHotspot } from "@/components/molecules/ComponentHotspot";
import { buildHotspots, trayTilt } from "@/lib/smartegg/derive";
import type { CSSVars } from "@/lib/smartegg/types";
import { useEggViews, useSmartEgg } from "@/lib/state/hooks";

/**
 * La incubadora: urna de cristal, flujo de aire y calor, bandeja giratoria y
 * los rótulos de cada componente.
 *
 * Los rótulos y sus guías salen 60 px por cada lado, así que en pila no caben
 * y se ocultan. Lo que anotan está debajo, en actuadores y sensores.
 */
export function IncubatorChamber() {
  const { critical, config, actions } = useSmartEgg();
  const eggs = useEggViews();
  const hotspots = buildHotspots(critical);

  const style: CSSVars = {
    "--tilt": `${trayTilt(critical)}deg`,
    "--airflow": config.airflowIntensity,
  };

  return (
    <div className="relative h-[470px] w-[548px]" style={style}>
      <div
        aria-hidden="true"
        className="chamber-shell absolute top-2 right-6 bottom-[34px] left-6 border border-frame"
      />

      <div className="chamber-glass absolute top-[26px] right-11 bottom-24 left-11 overflow-hidden border border-glass backdrop-blur-[1px]">
        <span aria-hidden="true" className="edge-light absolute inset-x-0 top-0 h-px" />
        <span
          aria-hidden="true"
          className="glass-sheen absolute top-0 left-[-30%] h-full w-[38%] -skew-x-12"
        />
        <span
          aria-hidden="true"
          className="heat-plume animate-breathe absolute top-[34px] left-1/2 -ml-[120px] h-[120px] w-[240px]"
        />
        <span
          aria-hidden="true"
          className="scan-beam animate-scan absolute inset-x-0 top-0 h-1.5"
        />

        <svg
          viewBox="0 0 460 348"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        >
          <g
            fill="none"
            strokeWidth="1.1"
            className="stroke-primary opacity-[var(--airflow)] drop-shadow-[0_0_5px_rgba(95,227,232,.7)]"
          >
            <path
              d="M 40 300 C 40 210 110 190 150 168 C 196 142 250 150 300 132 C 350 114 410 130 424 200"
              strokeDasharray="9 13"
              className="animate-flow-a"
            />
            <path
              d="M 56 268 C 90 232 140 236 186 212 C 236 186 290 200 340 176 C 386 154 412 178 412 232"
              strokeDasharray="6 16"
              opacity=".7"
              className="animate-flow-b"
            />
            <path
              d="M 74 322 C 130 300 176 306 228 288 C 286 268 348 284 396 262"
              strokeDasharray="4 14"
              opacity=".55"
              className="animate-flow-c"
            />
          </g>
          <g
            fill="none"
            strokeWidth="1"
            className="animate-heat stroke-[rgba(240,164,74,.55)]"
          >
            <path d="M 150 60 q 14 -16 28 0 t 28 0" />
            <path d="M 196 44 q 14 -16 28 0 t 28 0" />
            <path d="M 244 60 q 14 -16 28 0 t 28 0" />
          </g>
        </svg>

        <div className="absolute inset-x-0 bottom-[78px] flex origin-[50%_90%] items-end justify-center gap-[26px] transition-transform duration-[1200ms] ease-[cubic-bezier(.4,0,.2,1)] [transform:rotate(var(--tilt))]">
          {eggs.map((egg) => (
            <ChamberEgg
              key={egg.id}
              egg={egg}
              critical={critical}
              onSelect={() => actions.pickEgg(egg)}
              onHoverChange={(hovered) =>
                actions.hoverEgg(hovered ? egg.id : null)
              }
            />
          ))}
        </div>

        <span
          aria-hidden="true"
          className="tray-hairline absolute right-[34px] bottom-14 left-[34px] h-px"
        />

        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-3.5 flex justify-center gap-2"
        >
          <span className="relative h-5 w-[60px] overflow-hidden border border-primary/30">
            <span className="flow-bars animate-flow-bars absolute inset-0.5" />
          </span>
          <span className="heat-bar animate-heat-lamp h-5 w-[60px] border border-warning/30" />
        </div>

        {critical ? (
          <span
            aria-hidden="true"
            className="alarm-plume animate-breathe-alarm absolute top-5 left-1/2 -ml-[130px] h-[150px] w-[260px]"
          />
        ) : null}
      </div>

      <div className="chamber-plate absolute right-11 bottom-11 left-11 flex h-11 items-center justify-between border border-frame-soft px-3.5">
        <div className="font-mono text-[8px] tracking-[0.2em] text-foreground-faint">
          SMART EGG · INCUBADORA DIGITAL
        </div>
        <div aria-hidden="true" className="flex gap-1.5">
          <span className="animate-pulse-slow size-[5px] rounded-full bg-success" />
          <span className="animate-pulse-slow size-[5px] rounded-full bg-primary [animation-delay:0.6s]" />
          <span className="animate-pulse-slow size-[5px] rounded-full bg-warning [animation-delay:1.2s]" />
        </div>
      </div>

      <div className="hidden console:contents">
        <svg
          viewBox="0 0 548 470"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-[470px] w-[548px] overflow-visible"
        >
          <g stroke="rgba(150,180,195,.35)" fill="none" strokeWidth="1">
            <path d="M 120 70 L 40 70 L -60 70" />
            <path d="M 430 96 L 520 96 L 640 96" />
            <path d="M 452 250 L 540 250 L 640 250" />
            <path d="M 96 330 L 30 330 L -60 330" />
          </g>
          <g className="fill-primary">
            <circle cx="120" cy="70" r="2.5" />
            <circle cx="430" cy="96" r="2.5" />
            <circle cx="452" cy="250" r="2.5" />
            <circle cx="96" cy="330" r="2.5" />
          </g>
        </svg>

        {hotspots.map((hotspot) => (
          <ComponentHotspot
            key={hotspot.id}
            hotspot={hotspot}
            onSelect={() => actions.selectComponent(hotspot.id)}
          />
        ))}
      </div>
    </div>
  );
}
