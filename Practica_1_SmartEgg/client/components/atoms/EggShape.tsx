import { cx } from "@/lib/cx";

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
  className?: string;
}

/** La silueta SmartEgg — la primitiva con la que se dibuja cada espécimen. */
export function EggShape({
  variant,
  empty = false,
  hot = false,
  critical = false,
  className,
}: EggShapeProps) {
  const tone: Tone = hot ? "hot" : critical ? "critical" : "normal";

  return (
    <div
      aria-hidden="true"
      className={cx(
        "relative egg-shape border",
        SIZE[variant],
        empty
          ? "border-dashed border-[rgba(120,150,165,.45)]"
          : cx(
              "egg-fill border-[rgba(255,255,255,.18)]",
              GLOW[variant][tone],
              SPECULAR[variant],
            ),
        className,
      )}
    />
  );
}
