"use client";

import type { ReactNode } from "react";

import { BackdropLayers } from "@/components/atoms/BackdropLayers";
import { ParticleField } from "@/components/molecules/ParticleField";
import { ScreenHeader } from "@/components/organisms/ScreenHeader";
import { SelectionPanel } from "@/components/organisms/SelectionPanel";
import { SideNav } from "@/components/organisms/SideNav";
import { useStageScale } from "@/lib/hooks/useStageScale";
import { STAGE_WIDTH } from "@/lib/smartegg/catalog";
import type { CSSVars } from "@/lib/smartegg/types";
import { useSmartEgg } from "@/lib/state/hooks";

/**
 * Fondo, navegación, cabecera e inspector: lo que comparten las pantallas.
 *
 * Un solo árbol para las dos disposiciones; la elige la hoja de estilos en
 * `--breakpoint-console` (1440 px). Sin prefijo es la pila, con `console:` el
 * plano de 1680 × 1000 escalado a la ventana.
 */
export function ConsoleStage({ children }: { children: ReactNode }) {
  const { scale, width } = useStageScale();
  const { config } = useSmartEgg();

  const style: CSSVars = {
    "--stage-scale": scale,
    "--stage-width": `${width}px`,
    "--stage-slack": `${width - STAGE_WIDTH}px`,
  };

  return (
    <div
      style={style}
      className="console console-backdrop relative min-h-dvh w-full font-display text-foreground console:flex console:h-dvh console:flex-col console:overflow-hidden"
    >
      <BackdropLayers />
      {/* Las motas sólo se dibujan en el plano: en un móvil son batería. */}
      {config.showParticles ? (
        <div aria-hidden="true" className="hidden console:contents">
          <ParticleField />
        </div>
      ) : null}

      <div className="relative console:flex console:flex-1 console:overflow-auto console:overscroll-contain">
        {/* Reserva el tamaño ya escalado, que `transform` no ocupa sitio.
            Centra con `m-auto` y no con `justify-center`, que recorta el borde
            inicial al desbordar. En la pila se desvanece. */}
        <div className="contents console:m-auto console:block console:h-[calc(1000px*var(--stage-scale))] console:w-[calc(var(--stage-width)*var(--stage-scale))] console:shrink-0">
          <div className="flex flex-col gap-11 pb-24 console:relative console:block console:h-[1000px] console:w-[var(--stage-width)] console:origin-top-left console:pb-0 console:[transform:scale(var(--stage-scale))]">
            <SideNav />
            <ScreenHeader />
            {/* Dos columnas desde `md`: en una sola, un tablet en vertical
                dejaba más de la mitad del ancho vacío. */}
            <main className="grid grid-cols-1 gap-x-10 gap-y-11 px-5 md:grid-cols-2 console:block console:px-0">
              {children}
            </main>
            <SelectionPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
