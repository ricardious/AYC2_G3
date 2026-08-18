import { StatusDot } from "@/components/atoms/StatusDot";
import { DANGER } from "@/lib/smartegg/theme";

/** Franja de alarma térmica sobre la cámara mientras el nodo está crítico. */
export function CriticalAlertBanner() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border border-danger/45 bg-danger/8 px-4 py-[11px] console:w-[548px] console:flex-nowrap"
    >
      <StatusDot
        size={7}
        color={DANGER}
        glow={14}
        className="animate-pulse-alert"
      />
      <div className="font-mono text-[9px] tracking-[0.24em] text-danger-soft">
        ALERTA TÉRMICA
      </div>
      <div className="font-mono text-[8px] tracking-[0.1em] text-danger-text">
        Temperatura fuera del rango seguro · alarma activa
      </div>
    </div>
  );
}
