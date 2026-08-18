import { StatusDot } from "@/components/atoms/StatusDot";
import type {
  ActuatorPulse,
  ActuatorView,
  CSSVars,
} from "@/lib/smartegg/types";

/** Cadencia de parpadeo por actuador; los tokens están en `theme.css`. */
const PULSE: Record<ActuatorPulse, string> = {
  fan: "animate-pulse-slow",
  heater: "animate-pulse-heater",
  servo: "animate-pulse-servo",
  alarm: "animate-pulse-alarm",
  none: "",
};

interface ActuatorRowProps {
  actuator: ActuatorView;
  onSelect: () => void;
}

export function ActuatorRow({ actuator, onSelect }: ActuatorRowProps) {
  const style: CSSVars = { "--accent": actuator.color };

  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      className="flex min-h-11 items-center gap-3 border-b border-divider-soft pb-3 transition-colors hover:border-primary/40 console:min-h-0"
    >
      <span className="h-px w-[44px] shrink-0 bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
      <span className="flex-1">
        <span className="block text-xs tracking-[0.1em] text-foreground">
          {actuator.name}
        </span>
        <span className="mt-1 block font-mono text-[8px] tracking-[0.18em] text-[var(--accent)]">
          {actuator.state}
        </span>
      </span>
      <span className="font-mono text-[9px] text-foreground-faint">
        {actuator.metric}
      </span>
      <StatusDot
        size={6}
        color={actuator.color}
        className={PULSE[actuator.pulse]}
      />
    </button>
  );
}
