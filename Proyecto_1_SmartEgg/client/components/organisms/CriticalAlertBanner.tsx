import { StatusDot } from "@/components/atoms/StatusDot";
import { DANGER } from "@/lib/smartegg/theme";
import { useSmartEgg } from "@/lib/state/hooks";

/** Franja de alarma térmica sobre la cámara mientras el nodo está crítico. */
export function CriticalAlertBanner() {
  const { criticalAlarm } = useSmartEgg();
  const detail = criticalAlarm
    ? `${criticalAlarm.message}${criticalAlarm.value === null ? "" : ` · ${criticalAlarm.value}`}`
    : "Temperatura fuera del rango seguro · alarma activa";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border border-danger/45 bg-danger/8 px-4 py-[11px] console:w-[548px] console:flex-nowrap"
    >
      <StatusDot
        size={7}
        color={DANGER}
        glow={14}
        className="animate-pulse-alert"
      />
      <div className="font-mono text-[11px] tracking-[0.2em] text-danger-soft">
        ALERTA TÉRMICA
      </div>
      <div className="font-mono text-[11px] tracking-[0.07em] text-danger-text">
        {detail}
      </div>
    </div>
  );
}
