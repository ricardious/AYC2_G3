import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import type { CSSVars } from "@/lib/smartegg/types";

type DataFieldVariant = "sm" | "md" | "lg";

/** `sm` lectura en línea · `md` agregado del historial · `lg` línea de reporte. */
const FIELD: Record<
  DataFieldVariant,
  { root: string; label: string; value: string; fallback: string }
> = {
  sm: {
    root: "font-mono text-[11px] tracking-[0.12em]",
    label: "block text-foreground-faint",
    value: "block mt-1",
    fallback: "var(--color-foreground-muted)",
  },
  md: {
    root: "font-mono text-[11px] tracking-[0.13em]",
    label: "block text-foreground-faint",
    value: "block mt-[5px] text-[15px]",
    fallback: "var(--color-foreground-muted)",
  },
  lg: {
    root: "font-mono text-[11px] tracking-[0.13em]",
    label: "block text-foreground-paper",
    value: "block mt-[5px] text-base",
    fallback: "var(--color-foreground-bright)",
  },
};

interface DataFieldProps {
  label: string;
  value: ReactNode;
  valueColor?: string;
  variant?: DataFieldVariant;
  className?: string;
}

/** Un rótulo monoespaciado apilado sobre su valor. */
export function DataField({
  label,
  value,
  valueColor,
  variant = "sm",
  className,
}: DataFieldProps) {
  const spec = FIELD[variant];
  const style: CSSVars = { "--field-value": valueColor ?? spec.fallback };

  return (
    <div className={cx(spec.root, className)} style={style}>
      <span className={spec.label}>{label}</span>
      <span className={cx(spec.value, "text-[var(--field-value)]")}>
        {value}
      </span>
    </div>
  );
}
