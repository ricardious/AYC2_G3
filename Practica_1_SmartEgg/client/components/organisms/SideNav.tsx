"use client";

import { SmartEggLogo } from "@/components/atoms/SmartEggLogo";
import { NavItem } from "@/components/molecules/NavItem";
import { ThemeSwitcher } from "@/components/molecules/ThemeSwitcher";
import { NAV_ITEMS } from "@/lib/smartegg/catalog";
import { nodeStatus } from "@/lib/smartegg/derive";
import type { CSSVars } from "@/lib/smartegg/types";
import { useSmartEgg } from "@/lib/state/hooks";

/**
 * Navegación del nodo: barra superior en pila, riel izquierdo en el plano.
 * Un riel de 132 px se come un tercio de la pantalla de un móvil.
 *
 * El riel usa `inset-y-0` y no un alto fijo: aquí las cajas son `content-box`,
 * así que `h-[1000px]` le sumaba el relleno y sobresalía 34 px.
 */
export function SideNav() {
  const { screen, critical, actions } = useSmartEgg();
  const status = nodeStatus(critical);
  const statusStyle: CSSVars = { "--status": status.color };

  return (
    <nav
      aria-label="Navegación del nodo"
      className="border-b border-divider console:absolute console:inset-y-0 console:left-0 console:flex console:w-[132px] console:flex-col console:border-r console:border-b-0 console:pt-[34px]"
    >
      {/* En el riel la fila se desvanece con `contents`, para que el estado sea
          hijo directo de la columna y `mt-auto` pueda bajarlo al pie. */}
      <div className="flex items-center justify-between gap-4 px-5 pt-6 pb-4 console:contents">
        <SmartEggLogo
          subtitle="IOT · CONTROL CORE"
          className="console:block console:pl-[22px]"
          markClassName="console:h-[42px] console:w-[38px]"
        />

        <div
          style={statusStyle}
          className="flex shrink-0 items-center gap-3 font-mono text-[9px] tracking-[0.14em] text-foreground-fainter console:order-last console:flex-col console:items-start console:gap-0 console:pb-[30px] console:pl-[22px] console:text-[8px] console:leading-[1.9]"
        >
          <span className="hidden sm:block">NODO 01</span>
          <span className="hidden sm:block">LOTE A</span>
          <span className="text-[var(--status)]">● {status.word}</span>
        </div>
      </div>

      {/* En pila la tira se parte en filas: cinco secciones no caben en el
          ancho de un teléfono y desplazarlas dejaba las dos últimas fuera de
          alcance, sin nada que indicara que seguían ahí. */}
      <div className="flex flex-wrap gap-x-1 gap-y-0.5 px-5 console:mt-[54px] console:flex-col console:flex-nowrap console:gap-0.5 console:px-0">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            label={item.label}
            active={screen === item.id}
            onSelect={() => actions.navigate(item.id)}
          />
        ))}
      </div>

      <div className="px-5 py-3 console:mt-auto console:px-[22px] console:pt-0 console:pb-3">
        <ThemeSwitcher />
      </div>
    </nav>
  );
}
