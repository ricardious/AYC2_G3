"use client";

import type { ReactNode } from "react";

import { useFitScale } from "@/lib/hooks/useFitScale";
import { cx } from "@/lib/cx";
import type { CSSVars } from "@/lib/smartegg/types";

/** Cuánto del ancho sobrante se lleva la columna. */
export type StageAnchor = "left" | "center" | "right";

interface StageBlockProps {
  /** Coordenadas del diseño, sobre el plano de 1680 × 1000. */
  top: number;
  x: number;
  anchor?: StageAnchor;
  /** El bloque se estira hasta el margen derecho en vez de medir lo suyo. */
  fillRight?: boolean;
  /** Ocupa las dos columnas de la pila; para los que no caben en media. */
  wide?: boolean;
  /**
   * El instrumento se adapta al ancho en vez de medir lo suyo. Apaga el
   * desplazamiento lateral: sin esto el `w-max` interior mide por contenido y
   * un hijo `w-full` no tiene contra qué resolverse.
   */
  fluid?: boolean;
  /**
   * Ancho de diseño del instrumento. En pila se reduce hasta caber en vez de
   * desplazarse. Sólo para los que no admiten reflujo; si el instrumento puede
   * adaptarse, `fluid` es mejor porque no encoge su tipografía.
   */
  fit?: number;
  children: ReactNode;
}

const ANCHOR: Record<StageAnchor, string> = {
  left: "console:stage-left",
  center: "console:stage-center",
  right: "console:stage-right",
};

/**
 * Un instrumento y su sitio en la consola.
 *
 * La pantalla declara la posición una vez y la hoja de estilos decide: en el
 * plano el anclaje la aplica como coordenada absoluta, en la pila nadie lee
 * las variables y el bloque cae en el flujo.
 *
 * Los instrumentos van a 1:1 en las dos. Los que no caben se desplazan dentro
 * de su tarjeta; encogerlos dejaba sus rótulos por debajo de 5 px.
 */
export function StageBlock({
  top,
  x,
  anchor = "left",
  fillRight,
  wide,
  fluid,
  fit,
  children,
}: StageBlockProps) {
  const { containerRef, contentRef, scale, height } = useFitScale(fit ?? 1);

  const style: CSSVars = {
    "--stage-top": `${top}px`,
    "--stage-x": `${x}px`,
  };

  // El contragiro del especular y cualquier otro cálculo que dependa de la
  // reducción leen `--fit-scale`; en el plano vale 1.
  const fitStyle: CSSVars = fit
    ? { "--fit-scale": scale, width: `${fit}px` }
    : {};

  return (
    <div
      style={style}
      className={cx(
        "w-full overflow-x-auto overscroll-x-contain",
        "console:w-auto console:overflow-visible",
        wide ? "md:col-span-2" : null,
        ANCHOR[anchor],
        fillRight ? "console:right-10" : null,
      )}
    >
      {fit ? (
        <div ref={containerRef} className="w-full console:w-auto">
          <div
            style={height ? { height: height * scale } : undefined}
            className="overflow-hidden console:h-auto console:overflow-visible"
          >
            <div
              ref={contentRef}
              style={fitStyle}
              className="origin-top-left [transform:scale(var(--fit-scale,1))] console:w-auto console:[transform:none]"
            >
              {children}
            </div>
          </div>
        </div>
      ) : (
        <div className={cx(fluid ? "w-full" : "w-max", "console:w-auto")}>
          {children}
        </div>
      )}
    </div>
  );
}
