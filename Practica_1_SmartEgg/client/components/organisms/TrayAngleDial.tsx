"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { readTrayAngle } from "@/lib/smartegg/derive";
import { RADIAL_TICKS_PATH } from "@/lib/smartegg/geometry";
import type { CSSVars } from "@/lib/smartegg/types";
import { useSmartEgg } from "@/lib/state/hooks";

/**
 * Plataforma en perspectiva que lee la rotación actual de la bandeja.
 *
 * La caja mide 532 y no 480 porque `perspective(700px) rotateX(66deg)`
 * ensancha la elipse 26 px por lado. Declarar sólo los 480 del disco dejaba el
 * resto fuera, y cualquier recorte lo cortaba en recto.
 *
 * En pila el disco se estrecha con la caja en vez de salirse: el margen de 26
 * sigue reservado y las marcas radiales, que son SVG con `viewBox`, se estiran
 * con él. Nada de esto encoge tipografía — el disco es geometría, no texto.
 */
export function TrayAngleDial() {
  const { dashboard } = useSmartEgg();
  const servo = dashboard?.actuators.find(
    (actuator) => actuator.kind === "servo",
  );
  const angle = readTrayAngle(
    servo?.value,
    dashboard?.config.rotation_angle_degrees,
  );
  const style: CSSVars = { "--angle-pct": `${angle.pct}%` };

  return (
    <section
      aria-label="Ángulo de bandeja"
      className="relative h-[196px] w-full max-w-[532px] console:w-[532px]"
      style={style}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-[26px] top-0 h-[150px] transform-3d overflow-hidden rounded-[50%] [transform:perspective(700px)_rotateX(66deg)] console:right-auto console:left-[26px] console:w-[480px]"
      >
        <span className="platform-face absolute inset-0 rounded-[50%] border border-frame" />
        <span className="absolute inset-[44px_74px] rounded-[50%] border border-dashed border-frame-soft" />
        <span className="absolute inset-[78px_130px] rounded-[50%] border border-warning/24" />
        <span className="platform-sweep animate-sweep absolute inset-0 rounded-[50%] opacity-55" />
        <svg
          viewBox="0 0 480 150"
          preserveAspectRatio="none"
          className="absolute inset-0 h-[150px] w-full console:w-[480px]"
        >
          <path
            d={RADIAL_TICKS_PATH}
            fill="none"
            stroke="var(--gauge-ticks)"
            strokeWidth="1"
          />
        </svg>
      </div>

      <div className="absolute inset-x-0 top-[112px] text-center">
        <SectionKicker spacing="wide">ÁNGULO DE BANDEJA</SectionKicker>
        <div className="mt-0.5 text-[52px] leading-[1.1] font-light tracking-[-0.02em] text-foreground-bright [text-shadow:0_0_30px_var(--accent-mark)]">
          {angle.label}
        </div>
        <div className="mx-auto mt-2 w-full max-w-[340px] console:w-[340px]">
          <div className="relative h-px bg-rule-soft">
            <span
              aria-hidden="true"
              className="absolute top-[-5px] left-[var(--angle-pct)] h-[11px] w-px bg-primary shadow-[0_0_10px_var(--color-primary)]"
            />
          </div>
          <div className="mt-[7px] flex justify-between font-mono text-[8px] tracking-[0.14em] text-foreground-fainter">
            <span>-{angle.limit}°</span>
            <span>0°</span>
            <span>+{angle.limit}°</span>
          </div>
        </div>
      </div>
    </section>
  );
}
