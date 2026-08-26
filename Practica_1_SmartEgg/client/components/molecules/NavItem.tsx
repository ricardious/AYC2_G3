import { StatusDot } from "@/components/atoms/StatusDot";
import { cx } from "@/lib/cx";
import { PRIMARY } from "@/lib/smartegg/theme";

interface NavItemProps {
  label: string;
  active: boolean;
  onSelect: () => void;
}

/** Pestaña de pantalla; la selección se marca abajo en la barra y a la
 *  izquierda en el riel. */
export function NavItem({ label, active, onSelect }: NavItemProps) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={cx(
        "relative flex shrink-0 items-center gap-[9px] font-mono tracking-[0.14em] transition-colors hover:text-foreground-bright",
        // En el riel sí se parte: «CENTRO DE CONTROL» no cabe en 132 px.
        "whitespace-nowrap console:whitespace-normal",
        // py-4 deja los 44 px del mínimo táctil.
        "border-b-2 px-3 py-4 text-[10px]",
        "console:border-b-0 console:border-l-2 console:py-[11px] console:pr-2.5 console:pl-[22px] console:text-[9px]",
        active
          ? "border-b-primary bg-primary/6 text-foreground-bright console:border-b-transparent console:border-l-primary"
          : "border-b-transparent text-foreground-idle console:border-l-transparent",
      )}
    >
      <StatusDot size={3} color={active ? PRIMARY : "var(--color-dot-idle)"} />
      <span>{label}</span>
    </button>
  );
}
