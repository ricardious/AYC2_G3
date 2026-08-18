"use client";

import { useCallback, useState } from "react";

import {
  STAGE_GUTTER,
  STAGE_HEIGHT,
  STAGE_MAX_SCALE,
  STAGE_MAX_STRETCH,
  STAGE_MIN_SCALE,
  STAGE_WIDTH,
} from "@/lib/smartegg/catalog";

import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

export interface StageMetrics {
  scale: number;
  /** Ancho del plano. 1680 es el suelo; el sobrante es `--stage-slack`. */
  width: number;
}

/**
 * Escala y ancho del plano, que CSS no puede calcular: no sabe dividir el
 * viewport entre una longitud para obtener el número que pide `scale()`.
 *
 * El ajuste mide los dos ejes —con sólo el ancho, el plano desborda cualquier
 * ventana de menos de 1000 px de alto— y después estira el ancho hasta
 * cubrirla, porque ajustar sólo al alto deja bandas vacías a los lados.
 */
export function useStageScale(): StageMetrics {
  const [metrics, setMetrics] = useState<StageMetrics>({
    scale: STAGE_MAX_SCALE,
    width: STAGE_WIDTH,
  });

  const measure = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const fit = Math.min(
      (width - STAGE_GUTTER) / STAGE_WIDTH,
      (height - STAGE_GUTTER) / STAGE_HEIGHT,
    );
    const scale = Math.min(STAGE_MAX_SCALE, Math.max(STAGE_MIN_SCALE, fit));

    const stageWidth = Math.min(
      STAGE_WIDTH * STAGE_MAX_STRETCH,
      Math.max(STAGE_WIDTH, width / scale),
    );

    setMetrics((previous) =>
      previous.scale === scale && previous.width === stageWidth
        ? previous
        : { scale, width: stageWidth },
    );
  }, []);

  useIsomorphicLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return metrics;
}
