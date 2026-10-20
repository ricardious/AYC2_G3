"use client";

import { SmartEggLogo } from "@/components/atoms/SmartEggLogo";
import { NavItem } from "@/components/molecules/NavItem";
import { ThemeSwitcher } from "@/components/molecules/ThemeSwitcher";
import { NAV_ITEMS } from "@/lib/smartegg/catalog";
import { canOpenDoor, screensForRole } from "@/lib/auth/permissions";
import { nodeStatus } from "@/lib/smartegg/derive";
import type { CSSVars } from "@/lib/smartegg/types";
import { useSmartEgg } from "@/lib/state/hooks";
import { cx } from "@/lib/cx";

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round">
      <path d="M2.5 6h2.5L8.5 3v10L5 10H2.5Z" />
      {muted ? <path d="m11 6 3.5 4m0-4L11 10" /> : <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" />}
    </svg>
  );
}

/**
 * Navegación del nodo: barra superior en pila, riel izquierdo en el plano.
 * Un riel de 132 px se come un tercio de la pantalla de un móvil.
 *
 * El riel usa `inset-y-0` y no un alto fijo: aquí las cajas son `content-box`,
 * así que `h-[1000px]` le sumaba el relleno y sobresalía 34 px.
 */
export function SideNav() {
  const {
    screen,
    critical,
    technician,
    alarmSoundEnabled,
    alarmSoundBlocked,
    actions,
  } = useSmartEgg();
  const status = nodeStatus(critical);
  const statusStyle: CSSVars = { "--status": status.color };

  return (
    <nav
      aria-label="Navegación del nodo"
      className="border-b border-divider console:absolute console:inset-y-0 console:left-0 console:flex console:w-[148px] console:flex-col console:border-r console:border-b-0 console:pt-[34px]"
    >
      {/* En el riel la fila se desvanece con `contents`, para que el estado sea
          hijo directo de la columna y `mt-auto` pueda bajarlo al pie. */}
      <div className="flex items-center justify-between gap-4 px-5 pt-6 pb-4 console:contents">
        <SmartEggLogo
          subtitle="IOT · CONTROL CORE"
          className="console:block console:pl-[22px]"
          markClassName="console:h-[42px] console:w-[38px]"
        />

        {/* En el riel abre el pie: el estado es lo primero que se lee abajo. */}
        <div
          style={statusStyle}
          className="flex shrink-0 items-center gap-3 font-mono text-[11px] tracking-[0.11em] text-foreground-fainter console:order-2 console:mx-[22px] console:mt-auto console:flex-col console:items-start console:gap-1 console:border-t console:border-divider console:pt-4 console:pb-4"
        >
          <span className="hidden whitespace-nowrap sm:block console:text-[9px] console:tracking-[0.08em]">NODO 01 · LOTE A</span>
          <span className="text-[var(--status)] console:text-[12px] console:tracking-[0.14em]">● {status.word}</span>
        </div>
      </div>

      {/* En pila la tira se parte en filas: cinco secciones no caben en el
          ancho de un teléfono y desplazarlas dejaba las dos últimas fuera de
          alcance, sin nada que indicara que seguían ahí. */}
      <div className="flex flex-wrap gap-x-1 gap-y-0.5 px-5 console:order-1 console:mt-[54px] console:flex-col console:flex-nowrap console:gap-0.5 console:px-0">
        {NAV_ITEMS.filter(
          (item) => !technician || screensForRole(technician.role).includes(item.id),
        ).map((item) => (
          <NavItem
            key={item.id}
            label={item.label}
            active={screen === item.id}
            onSelect={() => actions.navigate(item.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 px-5 py-3 console:order-3 console:flex-col console:items-stretch console:gap-2.5 console:px-[22px] console:pt-0 console:pb-5">
        {technician ? (
          <div role="group" aria-label="Alarma sonora" className="flex min-w-32 flex-col gap-1.5 console:min-w-0">
            {/* El riel deja 104 px: «Probar» va en la línea del rótulo para que
                el interruptor tenga el ancho entero y su texto no desborde. */}
            <div className="flex items-center justify-between gap-2 font-mono text-[9px] tracking-[0.12em]">
              <span className="text-foreground-fainter">ALARMA</span>
              <button
                type="button"
                onClick={actions.testAlarmSound}
                title="Probar sonido de alarma"
                className="flex items-center gap-1 text-foreground-faint transition hover:text-primary"
              >
                <svg aria-hidden="true" viewBox="0 0 12 12" className="size-2" fill="currentColor">
                  <path d="M3 1.5v9l7.5-4.5Z" />
                </svg>
                PROBAR
              </button>
            </div>
            <button
              type="button"
              onClick={actions.toggleAlarmSound}
              aria-pressed={alarmSoundEnabled && !alarmSoundBlocked}
              title={alarmSoundBlocked ? "El navegador bloqueó el audio: pulsa para activarlo" : alarmSoundEnabled ? "Silenciar alarma" : "Activar sonido de alarma"}
              className={cx(
                "flex h-8 min-w-0 items-center gap-1.5 overflow-hidden border px-2 font-mono text-[10px] tracking-[0.1em] whitespace-nowrap transition",
                alarmSoundBlocked
                  ? "border-warning/50 text-warning hover:border-warning"
                  : alarmSoundEnabled
                    ? "border-primary/35 text-primary-soft hover:border-primary/70"
                    : "border-frame-soft text-foreground-faint hover:border-primary/60 hover:text-primary",
              )}
            >
              <SpeakerIcon muted={!alarmSoundEnabled || alarmSoundBlocked} />
              {alarmSoundBlocked ? "ACTIVAR" : alarmSoundEnabled ? "SONIDO" : "SILENCIO"}
            </button>
          </div>
        ) : null}
        {technician && canOpenDoor(technician.role) ? (
          <button
            type="button"
            onClick={actions.openDoorOperation}
            className="h-8 border border-primary/35 bg-primary/[0.07] px-3 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap text-primary-soft transition hover:border-primary/70 hover:bg-primary/15"
          >
            ◇ PUERTA
          </button>
        ) : null}
        <ThemeSwitcher className="console:w-full" />
      </div>
    </nav>
  );
}
