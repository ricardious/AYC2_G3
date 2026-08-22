import { cx } from "@/lib/cx";

interface SmartEggMarkProps {
  className?: string;
  title?: string;
}

/** Símbolo de marca: silueta de huevo atravesada por un circuito de control. */
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
        d="M32 3C23.5 14.7 10 30.5 10 47.1C10 60 19.6 69 32 69s22-9 22-21.9C54 30.5 40.5 14.7 32 3Z"
        className="fill-background/75 stroke-foreground-bright"
        strokeWidth="2"
      />
      <path
        d="M32 19v29m0-18H21m11 8h11"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="18" r="2.6" className="fill-primary" />
      <circle cx="20" cy="30" r="2.2" className="fill-background stroke-primary" strokeWidth="1.4" />
      <circle cx="44" cy="38" r="2.2" className="fill-background stroke-primary" strokeWidth="1.4" />
      <circle cx="32" cy="50" r="4" className="fill-primary" />
      <circle cx="32" cy="50" r="7.5" className="stroke-primary/25" />
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
