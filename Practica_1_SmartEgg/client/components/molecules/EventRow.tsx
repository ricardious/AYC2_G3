import type { CSSVars, EventView } from "@/lib/smartegg/types";

export function EventRow({ time, kind, text, color }: EventView) {
  const style: CSSVars = { "--accent": color };

  return (
    <li
      className="flex list-none gap-3 font-mono text-[8px] tracking-[0.12em]"
      style={style}
    >
      <span className="w-[52px] shrink-0 text-foreground-fainter">{time}</span>
      <span
        aria-hidden="true"
        className="w-px shrink-0 bg-[linear-gradient(180deg,var(--accent),transparent)]"
      />
      <span className="flex-1">
        <span className="block tracking-[0.2em] text-[var(--accent)]">
          {kind}
        </span>
        <span className="mt-1 block leading-[1.6] text-foreground-soft">
          {text}
        </span>
      </span>
    </li>
  );
}
