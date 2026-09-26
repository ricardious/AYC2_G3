import { cx } from "@/lib/cx";
import type { CSSVars } from "@/lib/smartegg/types";

export type EggShapeVariant = "chamber" | "chip" | "station";

const SIZE: Record<EggShapeVariant, string> = {
  chamber: "w-[46px] h-[62px]",
  chip: "w-[30px] h-[40px]",
  station: "w-[78px] h-[106px]",
};

/** El brillo especular se dibuja con `::after`; sólo cambia de sitio y tamaño. */
const SPECULAR: Record<EggShapeVariant, string> = {
  chamber:
    "egg-specular after:left-[9px] after:top-[9px] after:w-3 after:h-5 after:[filter:blur(2px)]",
  chip: "",
  station:
    "egg-specular [--specular-alpha:0.5] after:left-[18px] after:top-[18px] after:w-[18px] after:h-8 after:[filter:blur(3px)]",
};

/** La ficha de la tira es un elemento de lista, no una escena: no se mueve. */
const IDLE: Record<EggShapeVariant, boolean> = {
  chamber: true,
  chip: false,
  station: true,
};

type Tone = "hot" | "critical" | "normal";

const GLOW: Record<EggShapeVariant, Record<Tone, string>> = {
  chamber: {
    hot: "egg-glow-hot",
    critical: "egg-glow-alarm",
    normal: "egg-glow",
  },
  station: {
    hot: "egg-glow-hot",
    critical: "egg-glow-alarm",
    normal: "egg-glow",
  },
  chip: { hot: "egg-glow-chip", critical: "", normal: "" },
};

interface EggShapeProps {
  /** Contexto de dibujo: define tamaño, especular y escala de la sombra. */
  variant: EggShapeVariant;
  /** Una posición sin asignar se dibuja como contorno punteado. */
  empty?: boolean;
  /** Señalado o seleccionado: anillo y halo cian. */
  hot?: boolean;
  /** Alarma térmica: halo rojo. */
  critical?: boolean;
  /**
   * Posición en la bandeja. Desfasa el balanceo para que las cuatro piezas
   * no se muevan al unísono, que es lo que delata la animación.
   */
  slot?: number;
  className?: string;
}

/** La silueta SmartEgg — la primitiva con la que se dibuja cada espécimen. */
export function EggShape({
  variant,
  empty = false,
  hot = false,
  critical = false,
  slot = 0,
  className,
}: EggShapeProps) {
  const tone: Tone = hot ? "hot" : critical ? "critical" : "normal";
  const moves = IDLE[variant] && !empty;

  // Primos entre sí para que los ciclos tarden en volver a coincidir.
  const style: CSSVars = moves
    ? { animationDelay: `${-1.7 * (slot % 4) - 0.3}s` }
    : {};

  return (
    // Capa exterior: el gesto de interacción. Separada de la del balanceo
    // porque las dos animan `transform` y la animación gana a la transición.
    <div
      aria-hidden="true"
      className={cx(
        "relative transition-transform duration-300 ease-out",
        SIZE[variant],
        !empty && "group-hover:-translate-y-[3px]",
        className,
      )}
    >
      {/* Capa interior: el balanceo continuo y la pintura de la cáscara. */}
      <div
        style={style}
        className={cx(
          "egg-shape h-full w-full",
          moves && (critical ? "animate-egg-alarm" : "animate-egg-idle"),
          empty
            ? "border border-dashed border-[var(--egg-empty-border)]"
            : cx("egg-fill", GLOW[variant][tone], SPECULAR[variant]),
        )}
      />
    </div>
  );
}
