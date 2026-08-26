import { cx } from "@/lib/cx";

interface SmartEggMarkProps {
  className?: string;
  title?: string;
}

/**
 * Símbolo de marca: la silueta del espécimen con sus estratos de telemetría.
 *
 * Las cuatro líneas ganan peso hacia abajo, como la columna de humedad de la
 * consola: el símbolo es una lectura, no un adorno. La cáscara es un ovoide
 * —ancho abajo, estrecho y romo arriba— y no la gota puntiaguda de antes.
 */
export function SmartEggMark({
  className,
  title = "SmartEgg",
}: SmartEggMarkProps) {
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 64 72"
      fill="none"
      className={cx("h-10 w-9 shrink-0", className)}
    >
      <path
        d="M32 5C44 5 54 26 54 44C54 57 44 67 32 67C20 67 10 57 10 44C10 26 20 5 32 5Z"
        className="fill-background/75 stroke-foreground-bright"
        strokeWidth="2"
      />
      {/* Cada estrato va medido para morir dentro de la cáscara a su altura:
          por eso los anchos no son regulares y no hace falta recortarlos. */}
      <g
        className="stroke-primary"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <path d="M23 29h18" opacity=".28" />
        <path d="M17.5 38h29" opacity=".5" />
        <path d="M14 47h36" opacity=".78" />
        <path d="M16.5 56h31" />
      </g>
    </svg>
  );
}

interface SmartEggLogoProps {
  className?: string;
  markClassName?: string;
  compact?: boolean;
  subtitle?: string;
}

/** Logotipo completo para navegación y superficies de identificación. */
export function SmartEggLogo({
  className,
  markClassName,
  compact = false,
  subtitle = "INCUBACIÓN INTELIGENTE",
}: SmartEggLogoProps) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <SmartEggMark className={markClassName} />
      {compact ? null : (
        <div className="leading-none">
          <div className="text-[13px] font-semibold tracking-[0.2em] text-foreground-bright">
            SMART<span className="text-primary">EGG</span>
          </div>
          <div className="mt-2 font-mono text-[6.5px] tracking-[0.18em] text-foreground-faint">
            {subtitle}
          </div>
        </div>
      )}
    </div>
  );
}
