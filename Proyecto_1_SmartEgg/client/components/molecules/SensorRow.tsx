import { StatusDot } from "@/components/atoms/StatusDot";
import type { CSSVars, SensorView } from "@/lib/smartegg/types";

interface SensorRowProps {
  sensor: SensorView;
  onSelect: () => void;
}

export function SensorRow({ sensor, onSelect }: SensorRowProps) {
  const style: CSSVars = { "--accent": sensor.color };

  // La fila mide 11 px; fuera del plano necesita el mínimo táctil.
  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      className="flex min-h-11 items-center justify-between gap-2.5 font-mono text-[11px] tracking-[0.11em] text-foreground-muted transition-colors hover:text-foreground-bright console:min-h-0"
    >
      <span className="flex items-center gap-[9px]">
        <StatusDot
          size={5}
          color={sensor.color}
          glow={8}
          className="animate-pulse-sensor"
          // Los tres puntos respiran desfasados.
          style={{ animationDelay: `${sensor.delay}s` }}
        />
        {sensor.name}
      </span>
      <span className="text-[var(--accent)]">{sensor.state}</span>
    </button>
  );
}
