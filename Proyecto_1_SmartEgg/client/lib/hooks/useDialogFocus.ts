"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Encierra el tabulador dentro del diálogo y devuelve el foco a quien lo
 * abrió. Sin esto el foco se escapa al plano de fondo, que sigue detrás del
 * velo: quien navega con teclado recorre una consola que no puede ver.
 *
 * Si el foco está fuera del diálogo no hacemos nada; el menú del selector
 * vive en un portal y lleva su propia gestión de teclas.
 */
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;

    // Si el diálogo no se lleva el foco al abrirse, quien navega con teclado
    // sigue detrás del velo. El primer campo con `autoFocus` ya lo hizo; si no
    // hay ninguno, entra por la primera parada.
    if (node && !node.contains(document.activeElement)) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus();
      else {
        node.tabIndex = -1;
        node.focus();
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !node) return;
      const active = document.activeElement;
      if (!active || !node.contains(active)) return;

      const stops = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => element.offsetParent !== null);
      if (stops.length === 0) return;

      const first = stops[0];
      const last = stops[stops.length - 1];
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      opener?.focus?.();
    };
  }, []);

  return ref;
}
