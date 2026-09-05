import type { EggView } from "@/lib/smartegg/types";

/** Lectura flotante de un espécimen de la cámara. */
export function EggTooltip({ egg }: { egg: EggView }) {
  return (
    <span className="pointer-events-none absolute bottom-[96px] left-1/2 z-[5] -ml-[46px] flex w-[92px] flex-col border border-primary/35 bg-panel px-2 py-[7px] font-mono text-[7.5px] leading-[1.8] tracking-[0.1em] text-primary-soft">
      <span className="text-foreground-bright">{egg.label}</span>
      <span>{egg.line2}</span>
      <span>{egg.line3}</span>
    </span>
  );
}
