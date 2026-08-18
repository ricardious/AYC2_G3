import type { ComponentPropsWithoutRef } from "react";

import { cx } from "@/lib/cx";

export type GhostButtonTone = "danger" | "primary" | "dashed";

const TONE: Record<GhostButtonTone, string> = {
  danger: "btn-ghost-danger",
  primary: "btn-ghost-primary",
  dashed: "btn-ghost-dashed",
};

interface GhostButtonProps
  extends Omit<ComponentPropsWithoutRef<"button">, "className"> {
  tone?: GhostButtonTone;
  className?: string;
}

/** Botón delineado; el único estilo de botón del diseño. */
export function GhostButton({
  tone = "primary",
  className,
  children,
  ...props
}: GhostButtonProps) {
  return (
    <button
      type="button"
      className={cx("btn-ghost", TONE[tone], className)}
      {...props}
    >
      {children}
    </button>
  );
}
