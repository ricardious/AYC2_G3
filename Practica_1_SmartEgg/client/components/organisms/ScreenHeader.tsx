"use client";

import { GhostButton } from "@/components/atoms/GhostButton";
import { HeaderStat } from "@/components/molecules/HeaderStat";
import { SCREEN_TITLES } from "@/lib/smartegg/catalog";
import { buildHeaderStats } from "@/lib/smartegg/derive";
import { useSmartEgg, useTelemetry } from "@/lib/state/hooks";

/**
 * Título de pantalla, constantes del nodo y simulador de alarma. En la pila
 * las constantes pasan a rejilla; en una fila sólo cabrían recortadas.
 */
export function ScreenHeader() {
  const { screen, critical, config, actions } = useSmartEgg();
  const { clock } = useTelemetry();

  const [kicker, title] = SCREEN_TITLES[screen];
  const stats = buildHeaderStats(critical, clock, config.technician);

  return (
    <header className="flex flex-col gap-6 px-5 console:absolute console:top-[34px] console:right-10 console:left-[172px] console:flex-row console:items-start console:justify-between console:gap-10 console:px-0">
      <div>
        <div className="kicker kicker-wide text-foreground-faint">{kicker}</div>
        <h1 className="mt-[7px] text-[22px] font-normal tracking-[0.14em] text-foreground console:text-[19px] console:tracking-[0.16em]">
          {title}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 console:flex console:items-start console:gap-[38px]">
        {stats.map((stat) => (
          <HeaderStat key={stat.label} {...stat} />
        ))}
        {/* En rejilla ocupa su fila; en el plano va en la tira de constantes. */}
        <div className="col-span-full justify-self-start console:contents">
          <GhostButton tone="danger" onClick={actions.toggleCritical}>
            {critical ? "MODO NORMAL" : "SIMULAR ALERTA"}
          </GhostButton>
        </div>
      </div>
    </header>
  );
}
