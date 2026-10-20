"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
}

interface ThemedSelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  required?: boolean;
  compact?: boolean;
}

export function ThemedSelect({
  label,
  value,
  options,
  onValueChange,
  required = false,
  compact = false,
}: ThemedSelectProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options.find((option) => option.value === value);

  const placeMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(window.innerWidth - 16, Math.max(rect.width, compact ? 180 : rect.width));
    const height = Math.min(options.length * 44 + 8, 240);
    const below = window.innerHeight - rect.bottom;
    setPosition({
      top: below >= height || below >= rect.top ? rect.bottom + 5 : rect.top - height - 5,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
    });
  }, [compact, options.length]);

  const openMenu = () => {
    placeMenu();
    setOpen(true);
  };

  const choose = (next: string) => {
    onValueChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    optionRefs.current[selectedIndex]?.focus();
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        !triggerRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (
        !triggerRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open, placeMenu]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = optionRefs.current.findIndex((option) => option === document.activeElement);
    let next = current;
    if (event.key === "ArrowDown") next = (current + 1) % options.length;
    else if (event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    } else if (event.key === "Tab") {
      event.preventDefault();
      const focusable = Array.from(document.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
      )).filter((element) => !menuRef.current?.contains(element));
      const triggerIndex = focusable.indexOf(triggerRef.current!);
      setOpen(false);
      focusable[triggerIndex + (event.shiftKey ? -1 : 1)]?.focus();
      return;
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const match = options.findIndex((option, index) =>
        index > current && option.label.toLocaleLowerCase("es").startsWith(event.key.toLocaleLowerCase("es")),
      );
      const wrapped = options.findIndex((option) =>
        option.label.toLocaleLowerCase("es").startsWith(event.key.toLocaleLowerCase("es")),
      );
      optionRefs.current[match >= 0 ? match : wrapped]?.focus();
      return;
    } else return;
    event.preventDefault();
    optionRefs.current[next]?.focus();
  };

  return (
    <div className={compact ? "flex items-center gap-2" : "block"}>
      <span
        id={`${id}-label`}
        className={compact
          ? "text-xs text-foreground-muted"
          : "block font-mono text-[11px] tracking-[0.15em] text-foreground-faint"}
      >
        {label}{required ? <span className="text-danger"> *</span> : null}
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu();
          }
        }}
        className={`group flex min-h-11 items-center justify-between gap-3 border border-frame-soft bg-background/75 px-3 text-left text-foreground-bright transition-colors hover:border-primary/60 hover:bg-primary/[0.05] focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${compact ? "min-w-[150px] py-2 font-mono text-[12px]" : "mt-2 w-full py-2.5 font-mono text-[12px] tracking-[0.07em]"}`}
      >
        <span id={`${id}-value`} className="truncate">{selected?.label ?? "Seleccionar"}</span>
        <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" className={`h-3 w-3 shrink-0 text-primary transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m2 4 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          id={`${id}-listbox`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          onKeyDown={handleMenuKeyDown}
          style={{ position: "fixed", top: position.top, left: position.left, width: position.width }}
          className="z-[100] max-h-60 overflow-y-auto border border-primary/50 bg-background p-1 shadow-[0_16px_36px_-14px_rgba(0,0,0,0.35)]"
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              tabIndex={option.value === value ? 0 : -1}
              onClick={() => choose(option.value)}
              className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left font-mono text-[12px] tracking-[0.06em] transition-colors hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none ${option.value === value ? "bg-primary/[0.08] text-primary-soft" : "text-foreground-muted"}`}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value ? (
                <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" className="h-3 w-3 shrink-0 text-primary">
                  <path d="m2 6 2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
