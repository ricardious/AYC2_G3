import { StatusDot } from "@/components/atoms/StatusDot";
import { DANGER } from "@/lib/smartegg/theme";
import { useSmartEgg } from "@/lib/state/hooks";

const timeFormat = new Intl.DateTimeFormat("es-GT", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * Bloqueo por objeto extraño. Cubre toda la consola mientras la ESP32 informe
 * LOCK:1: solo una tarjeta RFID autorizada, pasada en la incubadora, lo libera.
 */
export function SystemLockOverlay() {
  const { systemLock, vision } = useSmartEgg();
  if (!systemLock?.locked) return null;

  const since = timeFormat.format(new Date(systemLock.recorded_at));

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="system-lock-title"
      aria-describedby="system-lock-detail"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-[560px] border border-danger/60 bg-danger/10 px-6 py-7">
        <div className="flex items-center gap-3">
          <StatusDot size={9} color={DANGER} glow={18} className="animate-pulse-alert" />
          <div className="font-mono text-[11px] tracking-[0.24em] text-danger-soft">
            ALERTA DE SEGURIDAD
          </div>
        </div>
        <h2
          id="system-lock-title"
          className="mt-4 font-mono text-[26px] leading-tight tracking-[0.12em] text-danger"
        >
          SISTEMA BLOQUEADO
        </h2>
        <p id="system-lock-detail" className="mt-3 text-[15px] leading-relaxed text-danger-text">
          La cámara detectó un objeto que no es un huevo dentro de la incubadora. El buzzer y
          la luz roja seguirán activos y los controles quedan deshabilitados.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground">
          Pase una <strong>tarjeta RFID autorizada</strong> en el lector de la incubadora y
          retire el objeto.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11px] tracking-[0.08em]">
          <dt className="text-foreground-faint">BLOQUEADO DESDE</dt>
          <dd className="text-danger-text">{since}</dd>
          {vision ? (
            <>
              <dt className="text-foreground-faint">ÚLTIMA FOTO</dt>
              <dd className="text-danger-text">
                {vision.clase.toUpperCase()} · {Math.round(vision.confianza * 100)} %
              </dd>
              <dt className="text-foreground-faint">FOTOS CON OBJETO</dt>
              <dd className="text-danger-text">
                {vision.votos_objeto} de {vision.ventana}
              </dd>
            </>
          ) : null}
        </dl>
      </div>
    </div>
  );
}
