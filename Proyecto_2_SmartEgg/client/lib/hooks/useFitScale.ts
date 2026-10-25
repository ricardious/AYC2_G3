"use client";

import { useCallback, useRef, useState } from "react";

import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

export interface FitMetrics {
  /** Va en la caja que mide el ancho disponible. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Va en la caja que se escala; se mide sin transformar. */
  contentRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  /** Alto natural del contenido, para reservar el sitio ya escalado. */
  height: number;
}

/**
 * Reduce un instrumento hasta que cabe a lo ancho, nunca lo agranda.
 *
 * Sólo para las piezas cuya composición está fijada en los dos ejes y no
 * admite reflujo. `transform` no ocupa sitio, así que el alto se mide sin
 * transformar y se reserva ya multiplicado.
 *
 * CSS no puede hacerlo solo: no sabe dividir el ancho disponible entre una
 * longitud para obtener el número sin unidad que pide `scale()`.
 */
export function useFitScale(intrinsicWidth: number): FitMetrics {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState({ scale: 1, height: 0 });

  const measure = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const available = container.clientWidth;
    if (!available) return;

    const scale = Math.min(1, available / intrinsicWidth);
    const height = content.offsetHeight;

    setMetrics((previous) =>
      Math.abs(previous.scale - scale) < 0.001 && previous.height === height
        ? previous
        : { scale, height },
    );
  }, [intrinsicWidth]);

  useIsomorphicLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return { containerRef, contentRef, ...metrics };
}
