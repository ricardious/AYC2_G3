"use client";
import { useEffect, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { useTelemetry } from "@/lib/state/hooks";
import { useCanvasPalette } from "@/lib/hooks/useCanvasPalette";

/** Histórico recibido por REST, actualizado con las lecturas en vivo. */
export function HistoryCharts() {
  const { series } = useTelemetry();
  const palette = useCanvasPalette();
  const [windowSize, setWindowSize] = useState(240);
  const [metric, setMetric] = useState<"t" | "h">("t");
  const canvas = useRef<HTMLCanvasElement>(null);
  const points = series.slice(-windowSize);
  useEffect(() => {
    if (!canvas.current) return;
    const data = series.slice(-windowSize);
    const color = metric === "t" ? palette.warning : palette.primary;
    const chart = new Chart(canvas.current, {
      type: "line",
      data: {
        labels: data.map((p, i) =>
          p.recordedAt
            ? new Date(p.recordedAt).toLocaleTimeString("es-GT")
            : `Lectura ${i + 1}`,
        ),
        datasets: [
          {
            label: metric === "t" ? "Temperatura (°C)" : "Humedad (%)",
            data: data.map((p) => p[metric]),
            borderColor: color,
            backgroundColor: color
              .replace("rgb(", "rgba(")
              .replace(")", ",0.08)"),
            borderWidth: 2,
            pointRadius: data.length === 1 ? 4 : 0,
            pointHitRadius: 20,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { displayColors: false },
        },
        scales: {
          x: {
            ticks: {
              color: palette.foreground,
              maxTicksLimit: 6,
              maxRotation: 0,
              font: { family: "monospace", size: 10 },
            },
            grid: { display: false },
          },
          y: {
            title: {
              display: true,
              text: metric === "t" ? "°C" : "%",
              color: palette.foreground,
            },
            ticks: { color: palette.foreground },
            grid: {
              color: palette.foreground
                .replace("rgb(", "rgba(")
                .replace(")", ",0.1)"),
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [series, windowSize, metric, palette]);
  return (
    <section aria-label="Historial de lecturas reales">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-foreground-faint">
            TRAZAS DEL MICROCLIMA
          </p>
          <h2 className="mt-2 text-2xl font-light">Cada lectura cuenta.</h2>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <label>
            Variable
            <select
              className="ml-2 border border-divider bg-background p-2"
              value={metric}
              onChange={(e) => setMetric(e.target.value as "t" | "h")}
            >
              <option value="t">Temperatura</option>
              <option value="h">Humedad</option>
            </select>
          </label>
          <label>
            Lecturas
            <select
              className="ml-2 border border-divider bg-background p-2"
              value={windowSize}
              onChange={(e) => setWindowSize(Number(e.target.value))}
            >
              <option value={30}>Últimas 30</option>
              <option value={120}>Últimas 120</option>
              <option value={240}>Últimas 240</option>
            </select>
          </label>
        </div>
      </div>
      <div className="relative h-[330px] w-full">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${metric === "t" ? "Temperatura" : "Humedad"}: ${points.length} lecturas. Valores disponibles en la tabla inferior.`}
        />
        {!points.length && (
          <p className="absolute inset-0 grid place-items-center text-sm text-foreground-faint">
            Todavía no hay lecturas registradas.
          </p>
        )}
      </div>
      <div className="mt-5 flex justify-between gap-4 border-t border-divider pt-4 font-mono text-[10px] text-foreground-faint">
        <span>{points.length} LECTURAS REALES</span>
        <span>Desliza sobre la curva para inspeccionar</span>
      </div>
      <details className="mt-5 text-xs">
        <summary className="cursor-pointer text-primary">
          Ver valores de las lecturas
        </summary>
        <div className="mt-3 max-h-32 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>°C</th>
                <th>Humedad %</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={`${p.recordedAt}-${i}`}>
                  <td>
                    {p.recordedAt
                      ? new Date(p.recordedAt).toLocaleString("es-GT")
                      : i + 1}
                  </td>
                  <td>{p.t.toFixed(1)}</td>
                  <td>{p.h.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
