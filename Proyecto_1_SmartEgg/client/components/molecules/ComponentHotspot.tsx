import type { CSSVars, HotspotView } from "@/lib/smartegg/types";

interface ComponentHotspotProps {
  hotspot: HotspotView;
  onSelect: () => void;
}

/** Rótulo anclado al diagrama de la cámara por una línea guía. */
export function ComponentHotspot({ hotspot, onSelect }: ComponentHotspotProps) {
  const style: CSSVars = {
    left: `${hotspot.x}px`,
    top: `${hotspot.y}px`,
    textAlign: hotspot.align,
    "--accent": hotspot.stateColor,
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      className="absolute block font-mono text-[8px] tracking-[0.16em] text-neutral transition-colors hover:text-foreground-bright"
    >
      <span className="block whitespace-nowrap">{hotspot.label}</span>
      <span className="mt-[3px] block whitespace-nowrap text-[var(--accent)]">
        {hotspot.state}
      </span>
    </button>
  );
}
