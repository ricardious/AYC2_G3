"use client";
import { useEffect, useRef } from "react";
import { echarts, type EChartsOption } from "@/lib/charts/echarts";

interface EChartProps {
  /** Memorizada por quien la construye: cada identidad nueva se fusiona. */
  option: EChartsOption;
  /** Descripción para lectores de pantalla; los valores van en la tabla. */
  label: string;
  /** Texto en lugar de la gráfica cuando no hay datos que dibujar. */
  empty?: string | null;
}

/**
 * Lienzo de ECharts que sigue a su contenedor. Las opciones nuevas se
 * fusionan con las anteriores: el zoom elegido sobrevive a las lecturas en vivo.
 */
export function EChart({ option, label, empty }: EChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const instance = echarts.init(element, null, { renderer: "canvas" });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    chart.current?.setOption(
      reduced ? { ...option, animation: false } : option,
      { lazyUpdate: true },
    );
  }, [option]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} role="img" aria-label={label} className="h-full w-full" />
      {empty ? (
        <p className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center font-mono text-[11px] tracking-[0.1em] text-foreground-faint">
          {empty}
        </p>
      ) : null}
    </div>
  );
}
