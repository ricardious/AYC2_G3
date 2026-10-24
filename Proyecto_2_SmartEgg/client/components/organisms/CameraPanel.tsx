"use client";

import { useEffect, useState } from "react";

import { DataField } from "@/components/atoms/DataField";
import { SectionKicker } from "@/components/atoms/SectionKicker";
import { StatusDot } from "@/components/atoms/StatusDot";
import { cx } from "@/lib/cx";
import type { MqttVisionResult } from "@/lib/mqtt/messages";
import {
  DANGER,
  FOREGROUND_FAINTER,
  FOREGROUND_MUTED,
  SUCCESS,
  WARNING,
} from "@/lib/smartegg/theme";
import { useSmartEgg } from "@/lib/state/hooks";

/** El gateway manda una foto por segundo; cinco sin fotos ya es una cámara caída. */
const STALE_AFTER_MS = 5_000;

const CLASS_LABEL: Record<string, { text: string; color: string }> = {
  huevo: { text: "HUEVO", color: SUCCESS },
  objeto: { text: "OBJETO EXTRAÑO", color: DANGER },
  vacio: { text: "BANDEJA VACÍA", color: FOREGROUND_MUTED },
};

function percent(value: number | null | undefined): string {
  return typeof value === "number" ? `${Math.round(value * 100)} %` : "—";
}

function verdict(vision: MqttVisionResult | null) {
  if (!vision) return { text: "SIN DATOS", color: FOREGROUND_FAINTER };
  return CLASS_LABEL[vision.clase] ?? { text: vision.clase.toUpperCase(), color: WARNING };
}

/** Reloj de un segundo para notar cuándo deja de llegar la foto. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

interface CameraFeedProps {
  className?: string;
  /** Marco rojo cuando la foto es la que tiene bloqueada la incubadora. */
  alert?: boolean;
}

/** La foto en vivo de la bandeja, o el aviso de que no está llegando. */
export function CameraFeed({ className, alert }: CameraFeedProps) {
  const { cameraFrame } = useSmartEgg();
  const now = useNow();
  const stale = !cameraFrame || now - cameraFrame.receivedAt > STALE_AFTER_MS;

  return (
    <div
      className={cx(
        "relative aspect-[4/3] overflow-hidden border bg-foreground/5",
        alert ? "border-danger/70" : "border-divider",
        className,
      )}
    >
      {cameraFrame ? (
        // Es una URL de blob que cambia cada segundo: next/image no aporta nada aquí.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cameraFrame.url}
          alt="Foto en vivo de la bandeja de la incubadora"
          className={cx("size-full object-cover", stale ? "opacity-35 grayscale" : null)}
        />
      ) : null}
      {stale ? (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] tracking-[0.18em] text-foreground-faint">
          {cameraFrame ? "SIN SEÑAL" : "ESPERANDO CÁMARA"}
        </div>
      ) : null}
    </div>
  );
}

/**
 * La cámara de la bandeja junto al veredicto del modelo de visión: lo que ve el
 * celular y lo que decide el servicio, en la misma pantalla que el resto del nodo.
 */
export function CameraPanel() {
  const { cameraFrame, vision, systemLock } = useSmartEgg();
  const now = useNow();
  const live = cameraFrame !== null && now - cameraFrame.receivedAt <= STALE_AFTER_MS;
  const current = verdict(vision);
  const detected = vision?.objeto_detectado ?? false;

  return (
    <section aria-label="Cámara de la bandeja" className="w-full">
      <div className="flex items-center justify-between">
        <SectionKicker tone="cyan">CÁMARA · VISIÓN</SectionKicker>
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.11em] text-foreground-muted">
          <StatusDot
            size={5}
            color={live ? SUCCESS : DANGER}
            glow={8}
            className={live ? "animate-pulse-sensor" : undefined}
          />
          {live ? "EN VIVO" : "SIN SEÑAL"}
        </span>
      </div>
      <div className="mt-3.5 flex gap-4">
        <CameraFeed className="w-[200px] shrink-0" alert={systemLock?.locked} />
        <div className="flex min-w-0 flex-col gap-3">
          <DataField label="ÚLTIMA FOTO" value={current.text} valueColor={current.color} />
          <DataField
            label="P. OBJETO · 5 FOTOS"
            value={percent(vision?.prob_objeto_media)}
            valueColor={detected ? DANGER : undefined}
          />
          <DataField
            label="DECISIÓN"
            value={detected ? "BLOQUEAR" : "VIGILANDO"}
            valueColor={detected ? DANGER : SUCCESS}
          />
        </div>
      </div>
    </section>
  );
}
