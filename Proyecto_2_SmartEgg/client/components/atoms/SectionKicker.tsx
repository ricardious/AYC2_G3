import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export type KickerTone = "amber" | "cyan" | "muted";

const TONE: Record<KickerTone, string> = {
  amber: "text-warning-dim",
  cyan: "text-primary-dim",
  muted: "text-foreground-faint",
};

interface SectionKickerProps {
  children: ReactNode;
  /** Familia de color del instrumento al que pertenece la sección. */
  tone?: KickerTone;
  /** `wide` iguala el tracking extra de los encabezados de pantalla. */
  spacing?: "normal" | "wide";
  className?: string;
}

/** La etiqueta monoespaciada y espaciada que titula cada panel. */
export function SectionKicker({
  children,
  tone = "muted",
  spacing = "normal",
  className,
}: SectionKickerProps) {
  return (
    <div
      className={cx(
        "kicker",
        spacing === "wide" && "kicker-wide",
        TONE[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
