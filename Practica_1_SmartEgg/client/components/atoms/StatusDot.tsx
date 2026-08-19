import { cx } from "@/lib/cx";
import type { CSSVars } from "@/lib/smartegg/types";

interface StatusDotProps {
  /** Diámetro en píxeles del escenario. */
  size: number;
  color: string;
  /** Radio del halo; omítelo para un punto plano. */
  glow?: number;
  /** Para añadir cadencia (`animate-*`) o retardo desde quien lo usa. */
  className?: string;
  style?: CSSVars;
}

/** Indicador redondo de telemetría, presente en toda la consola. */
export function StatusDot({
  size,
  color,
  glow,
  className,
  style,
}: StatusDotProps) {
  const vars: CSSVars = {
    ...style,
    "--dot": color,
    "--dot-size": `${size}px`,
    ...(glow ? { "--dot-glow": `${glow}px` } : {}),
  };

  return (
    <span
      aria-hidden="true"
      className={cx(
        "block shrink-0 rounded-full size-[var(--dot-size)] bg-[var(--dot)]",
        glow ? "shadow-[0_0_var(--dot-glow)_var(--dot)]" : null,
        className,
      )}
      style={vars}
    />
  );
}
