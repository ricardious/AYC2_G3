import type { ReactNode } from "react";

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
  children,
}: StageBlockProps) {
  const style: CSSVars = {
    "--stage-top": `${top}px`,
    "--stage-x": `${x}px`,
  };

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
      <div className="w-max console:w-auto">{children}</div>
    </div>
  );
}
