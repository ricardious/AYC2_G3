"use client";

import { NavItem } from "@/components/molecules/NavItem";
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
        <div className="flex items-center gap-3 console:block console:pl-[22px]">
          <div
            aria-hidden="true"
            className="egg-shape h-[15px] w-[11px] shrink-0 bg-[linear-gradient(160deg,#eaf3f5,#8fa2a8)] shadow-[0_0_12px_rgba(95,227,232,.5)]"
          />
          <div>
            <div className="text-[13px] font-semibold tracking-[0.22em] console:mt-3.5 console:text-xs">
              SMART<span className="text-primary console:block">EGG</span>
            </div>
            <div className="mt-1 font-mono text-[8px] tracking-[0.16em] text-foreground-faint console:mt-2">
              IOT · v2.4
            </div>
          </div>
        </div>

        <div
          style={statusStyle}
          className="flex shrink-0 items-center gap-3 font-mono text-[9px] tracking-[0.14em] text-foreground-fainter console:order-last console:mt-auto console:flex-col console:items-start console:gap-0 console:pb-[30px] console:pl-[22px] console:text-[8px] console:leading-[1.9]"
        >
          <span className="hidden sm:block">NODO 01</span>
          <span className="hidden sm:block">LOTE A</span>
          <span className="text-[var(--status)]">● {status.word}</span>
        </div>
      </div>

      {/* La tira se desplaza en vez de partirse en dos filas. */}
      <div className="flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] console:mt-[54px] console:flex-col console:gap-0.5 console:overflow-visible console:px-0 [&::-webkit-scrollbar]:hidden">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            label={item.label}
            active={screen === item.id}
            onSelect={() => actions.navigate(item.id)}
          />
        ))}
      </div>
    </nav>
  );
}
