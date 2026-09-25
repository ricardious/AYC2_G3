"use client";
import { useMemo, useState, type ReactNode } from "react";
import type { CustomSeriesRenderItem } from "echarts";
import { EChart } from "@/components/molecules/EChart";
import { ThemedSelect } from "@/components/molecules/ThemedSelect";
import { echarts, type EChartsOption } from "@/lib/charts/echarts";
import { useCanvasPalette } from "@/lib/hooks/useCanvasPalette";
import { useSmartEgg, useTelemetry } from "@/lib/state/hooks";

type Palette = ReturnType<typeof useCanvasPalette>;

const ALARM_KINDS: [string, string][] = [
  ["temperature_high", "TEMP. ALTA"],
  ["temperature_low", "TEMP. BAJA"],
  ["humidity_high", "HUM. ALTA"],
  ["humidity_low", "HUM. BAJA"],
  ["door_open", "PUERTA"],
];

const alpha = (rgb: string, value: number) =>
  rgb.replace("rgb(", "rgba(").replace(")", `,${value})`);

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });

/** Degradado vertical que se apaga hacia el eje: el área sin tapar la retícula. */
/** En papel el brillo ensucia el trazo: sólo se aplica sobre la cámara oscura. */
const glow = (p: Palette, color: string, blur = 12) =>
  p.light ? {} : { shadowBlur: blur, shadowColor: alpha(color, 0.6) };

const fade = (color: string, top = 0.32) =>
  new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: alpha(color, top) },
    { offset: 1, color: alpha(color, 0) },
  ]);

/** Extensión del eje que abarca datos y rango óptimo, con margen: así la
 *  franja se ve entera y se lee si las lecturas quedan dentro o fuera. */
const around = (low: number | undefined, high: number | undefined, pad: number) => ({
  min: (v: { min: number }) => +(Math.min(v.min, low ?? v.min) - pad).toFixed(1),
  max: (v: { max: number }) => +(Math.max(v.max, high ?? v.max) + pad).toFixed(1),
});

/** Lenguaje común: retícula punteada, rótulos mono y tooltip como panel. */
function chrome(p: Palette) {
  const label = { color: p.faint, fontFamily: p.mono, fontSize: 10 };
  const line = { lineStyle: { color: alpha(p.foreground, 0.28) } };
  const split = { lineStyle: { color: alpha(p.foreground, 0.1), type: [2, 4] as number[] } };
  return {
    label,
    time: {
      type: "time" as const,
      axisLine: line,
      axisTick: { show: false },
      axisLabel: { ...label, hideOverlap: true, formatter: (v: number) => clock(v) },
      splitLine: { show: false },
    },
    value: (name: string, position: "left" | "right" = "left") => ({
      type: "value" as const,
      name,
      position,
      nameTextStyle: { ...label, align: position === "left" ? ("right" as const) : ("left" as const) },
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      // Los extremos calculados caen fuera de la retícula y se amontonan.
      axisLabel: { ...label, showMinLabel: false, showMaxLabel: false },
      splitLine: position === "left" ? split : { show: false },
    }),
    tooltip: {
      backgroundColor: alpha(p.background, 0.94),
      borderColor: alpha(p.primary, 0.45),
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: p.bright, fontFamily: p.mono, fontSize: 11 },
      extraCssText:
        "border-radius:0;backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.35);letter-spacing:.04em",
    },
    pointer: {
      type: "line" as const,
      lineStyle: { color: alpha(p.primary, 0.6), type: "dashed" as const },
      label: { show: false },
    },
  };
}

function Panel({ index, title, meta, children, className }: {
  index: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`relative border-t border-divider pt-3 ${className ?? ""}`}>
      {/* Marca de instrumento: el mismo acento que las lecturas de la consola. */}
      <span aria-hidden="true" className="absolute -top-px left-0 h-px w-10 bg-primary" />
      <figcaption className="mb-2 flex items-baseline justify-between gap-4 font-mono text-[10px] tracking-[0.14em] text-foreground-faint">
        <span>
          <span className="text-primary">{index}</span> · {title}
        </span>
        {meta ? <span className="text-right tracking-[0.08em]">{meta}</span> : null}
      </figcaption>
      {children}
    </figure>
  );
}

function Key({ color, children, dashed }: { color: string; children: ReactNode; dashed?: boolean }) {
  return (
    <span className="ml-3 inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`inline-block h-0 w-3 border-t-2 ${dashed ? "border-dashed" : ""}`}
        style={{ borderColor: color }}
      />
      {children}
    </span>
  );
}

/** Histórico por REST, actualizado con las lecturas y alarmas en vivo. */
export function HistoryCharts() {
  const { series } = useTelemetry();
  const { demoActive, dashboard, alarmHistory, rotationHistory } = useSmartEgg();
  const palette = useCanvasPalette();
  const [windowSize, setWindowSize] = useState(240);
  const points = useMemo(
    () =>
      series
        .slice(-windowSize)
        .filter((p) => p.recordedAt)
        .map((p) => ({ ...p, ms: Date.parse(p.recordedAt!) })),
    [series, windowSize],
  );
  const config = dashboard?.config;
  const capacity = dashboard?.occupancy.capacity ?? 4;
  const start = points[0]?.ms;
  const end = points.at(-1)?.ms;
  const last = points.at(-1);

  // 01 · Pulso: dos trazos con brillo, franjas óptimas y umbral crítico.
  const pulse = useMemo<EChartsOption>(() => {
    const c = chrome(palette);
    const trace = (name: string, key: "t" | "h", color: string, axis: number) => ({
      name,
      type: "line" as const,
      yAxisIndex: axis,
      data: points.map((p) => [p.ms, p[key]]),
      smooth: 0.35,
      showSymbol: false,
      lineStyle: { width: 2, color, ...glow(palette, color) },
      itemStyle: { color },
      areaStyle: { color: fade(color, 0.22) },
      emphasis: { disabled: true },
    });
    const band = (min?: number, max?: number, color = palette.primary) =>
      min == null || max == null
        ? undefined
        : {
            silent: true,
            itemStyle: { color: alpha(color, 0.07), borderColor: alpha(color, 0.35), borderWidth: 1, borderType: [3, 4] as number[] },
            data: [[{ yAxis: min }, { yAxis: max }]] as [{ yAxis: number }, { yAxis: number }][],
          };
    const temperature = trace("Temperatura", "t", palette.warning, 0);
    const humidity = trace("Humedad", "h", palette.primary, 1);
    return {
      animationDuration: 900,
      animationDurationUpdate: 300,
      grid: { top: 22, left: 44, right: 44, bottom: 42 },
      tooltip: {
        ...c.tooltip,
        trigger: "axis",
        axisPointer: c.pointer,
        formatter: (raw) => {
          const items = (Array.isArray(raw) ? raw : [raw]).filter((i) => i.seriesType === "line");
          if (!items.length) return "";
          const [ms] = items[0].value as [number, number];
          const rows = items.map((i) => {
            const [, v] = i.value as [number, number];
            const unit = i.seriesName === "Temperatura" ? "°C" : "%";
            return `<span style="color:${i.color}">●</span> ${i.seriesName} <b style="float:right;margin-left:18px">${v.toFixed(1)} ${unit}</b>`;
          });
          return `<div style="color:${palette.faint};margin-bottom:4px">${new Date(ms).toLocaleString("es-GT")}</div>${rows.join("<br/>")}`;
        },
      },
      xAxis: { ...c.time, min: start, max: end },
      yAxis: [
        {
          ...c.value("°C"),
          ...around(config?.temperature_min_c, config?.temperature_max_c, 0.3),
          axisLabel: { ...c.value("°C").axisLabel, color: alpha(palette.warning, 0.8) },
        },
        {
          ...c.value("%", "right"),
          ...around(config?.humidity_min_pct, config?.humidity_max_pct, 3),
          axisLabel: { ...c.value("%").axisLabel, color: alpha(palette.primary, 0.8) },
        },
      ],
      dataZoom: [
        { type: "inside", filterMode: "none" },
        {
          type: "slider",
          height: 12,
          bottom: 6,
          left: 44,
          right: 44,
          filterMode: "none",
          showDetail: false,
          brushSelect: false,
          borderColor: "transparent",
          backgroundColor: alpha(palette.foreground, 0.06),
          fillerColor: alpha(palette.primary, 0.16),
          dataBackground: {
            lineStyle: { color: alpha(palette.primary, 0.5), width: 1 },
            areaStyle: { color: alpha(palette.primary, 0.08) },
          },
          selectedDataBackground: {
            lineStyle: { color: palette.primary, width: 1 },
            areaStyle: { color: alpha(palette.primary, 0.18) },
          },
          handleIcon: "path://M0,0 h2 v12 h-2 Z",
          handleSize: "140%",
          handleStyle: { color: palette.primary, borderColor: palette.primary },
          moveHandleSize: 0,
        },
      ],
      series: [
        { ...temperature, markArea: band(config?.temperature_min_c, config?.temperature_max_c, palette.warning) },
        { ...humidity, markArea: band(config?.humidity_min_pct, config?.humidity_max_pct, palette.primary) },
        {
          type: "line",
          yAxisIndex: 0,
          data: [],
          markLine: config
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { color: palette.danger, type: "dashed", width: 1 },
                label: { formatter: `CRÍTICO ${config.critical_temperature_c} °C`, color: palette.danger, fontFamily: palette.mono, fontSize: 9, position: "insideEndTop" },
                data: [{ yAxis: config.critical_temperature_c }],
              }
            : undefined,
        },
        // Pulso de la lectura más reciente.
        ...(last
          ? ([
              [last.t, palette.warning, 0],
              [last.h, palette.primary, 1],
            ] as const).map(([value, color, axis]) => ({
              type: "effectScatter" as const,
              yAxisIndex: axis,
              data: [[last.ms, value]],
              symbolSize: 7,
              rippleEffect: { scale: 3.2, brushType: "stroke" as const, period: 3 },
              itemStyle: { color, ...glow(palette, color, 10) },
              tooltip: { show: false },
              z: 5,
            }))
          : []),
      ],
    };
  }, [config, end, last, palette, points, start]);

  // 02 · Espacio de fase: cada lectura como punto (humedad, temperatura).
  const phase = useMemo<EChartsOption>(() => {
    const c = chrome(palette);
    const trail = points.slice(-24);
    return {
      animationDurationUpdate: 300,
      grid: { top: 22, left: 44, right: 16, bottom: 30 },
      tooltip: {
        ...c.tooltip,
        trigger: "item",
        formatter: (raw) => {
          const item = Array.isArray(raw) ? raw[0] : raw;
          const [h, t, ms] = item.value as [number, number, number];
          return `<div style="color:${palette.faint};margin-bottom:4px">${new Date(ms).toLocaleString("es-GT")}</div>${t.toFixed(1)} °C · ${h.toFixed(1)} %`;
        },
      },
      xAxis: {
        ...c.value("%"),
        ...around(config?.humidity_min_pct, config?.humidity_max_pct, 3),
        nameLocation: "end",
        nameGap: 6,
        splitLine: { lineStyle: { color: alpha(palette.foreground, 0.1), type: [2, 4] } },
      },
      yAxis: { ...c.value("°C"), ...around(config?.temperature_min_c, config?.temperature_max_c, 0.3) },
      visualMap: {
        show: false,
        dimension: 2,
        seriesIndex: 0,
        min: start ?? 0,
        max: end ?? 1,
        inRange: { color: [alpha(palette.primary, 0.12), palette.primary], symbolSize: [3, 7] },
      },
      series: [
        {
          type: "scatter",
          data: points.map((p) => [p.h, p.t, p.ms]),
          itemStyle: { opacity: 0.9 },
          markArea: config
            ? {
                silent: true,
                itemStyle: { color: alpha(palette.success, 0.06), borderColor: alpha(palette.success, 0.5), borderWidth: 1, borderType: [3, 4] },
                label: { show: true, position: "insideTopLeft", formatter: "ZONA ÓPTIMA", color: alpha(palette.success, 0.8), fontFamily: palette.mono, fontSize: 9 },
                data: [[
                  { coord: [config.humidity_min_pct, config.temperature_min_c] },
                  { coord: [config.humidity_max_pct, config.temperature_max_c] },
                ]],
              }
            : undefined,
        },
        {
          type: "line",
          data: trail.map((p) => [p.h, p.t, p.ms]),
          showSymbol: false,
          smooth: 0.4,
          lineStyle: { width: 1, color: alpha(palette.bright, 0.35) },
          tooltip: { show: false },
          silent: true,
        },
        ...(last
          ? [{
              type: "effectScatter" as const,
              data: [[last.h, last.t, last.ms]],
              symbolSize: 9,
              rippleEffect: { scale: 3.5, brushType: "stroke" as const, period: 3 },
              itemStyle: { color: palette.bright, ...glow(palette, palette.primary, 14) },
              z: 5,
            }]
          : []),
      ],
    };
  }, [config, end, last, palette, points, start]);

  // 03 · Cronología de alarmas: cada episodio es un tramo en su carril.
  const alarmLanes = useMemo(() => {
    // «Ahora» es la última lectura o la alarma más reciente; los episodios
    // abiertos llegan hasta ahí.
    const now = Math.max(
      end ?? 0,
      ...alarmHistory.map((a) => Date.parse(a.resolved_at ?? a.occurred_at)),
    );
    const episodes = alarmHistory
      .map((a) => ({
        lane: ALARM_KINDS.findIndex(([kind]) => kind === a.kind),
        from: Date.parse(a.occurred_at),
        to: a.resolved_at ? Date.parse(a.resolved_at) : now,
        critical: a.severity === "critical",
        open: !a.resolved_at,
        message: a.message,
      }))
      .filter((e) => e.lane >= 0);
    const counts = ALARM_KINDS.map((_, lane) => episodes.filter((e) => e.lane === lane).length);
    const from = Math.min(start ?? now, ...episodes.map((e) => e.from));
    return { episodes, counts, from, now };
  }, [alarmHistory, end, start]);

  const timeline = useMemo<EChartsOption>(() => {
    const c = chrome(palette);
    const renderItem: CustomSeriesRenderItem = (params, api) => {
      const lane = api.value(0);
      const a = api.coord([api.value(1), lane]);
      const b = api.coord([api.value(2), lane]);
      const height = (api.size?.([0, 1]) as number[])[1] * 0.46;
      const system = params.coordSys as unknown as { x: number; y: number; width: number; height: number };
      const shape = echarts.graphic.clipRectByRect(
        { x: a[0], y: a[1] - height / 2, width: Math.max(b[0] - a[0], 4), height },
        { x: system.x, y: system.y, width: system.width, height: system.height },
      );
      const color = api.visual("color") as string;
      return shape
        ? {
            type: "rect",
            transition: ["shape"],
            shape,
            style: { fill: color, ...glow(palette, color, 10) },
          }
        : null;
    };
    return {
      animationDurationUpdate: 300,
      grid: { top: 8, left: 92, right: 14, bottom: 24 },
      tooltip: {
        ...c.tooltip,
        trigger: "item",
        formatter: (raw) => {
          const item = Array.isArray(raw) ? raw[0] : raw;
          const [lane, from, to, open] = item.value as [number, number, number, number];
          const minutes = Math.max(1, Math.round((to - from) / 60_000));
          return `<b style="color:${item.color}">${ALARM_KINDS[lane][1]}</b><br/>${new Date(from).toLocaleString("es-GT")}<br/><span style="color:${palette.faint}">${open ? "ACTIVA · " : ""}${minutes} min</span>`;
        },
      },
      xAxis: { ...c.time, min: alarmLanes.from, max: alarmLanes.now },
      yAxis: {
        type: "category",
        inverse: true,
        data: ALARM_KINDS.map(([, name], lane) => `${name}  ${alarmLanes.counts[lane]}`),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...c.label, color: palette.faint },
        splitLine: { show: true, lineStyle: { color: alpha(palette.foreground, 0.08) } },
      },
      series: [{
        type: "custom",
        renderItem,
        encode: { x: [1, 2], y: 0 },
        data: alarmLanes.episodes.map((e) => ({
          value: [e.lane, e.from, e.to, e.open ? 1 : 0],
          itemStyle: { color: e.critical ? palette.danger : palette.warning },
        })),
      }],
    };
  }, [alarmLanes, palette]);

  // 04 · Bandeja: ángulo escalonado sobre la ocupación.
  const tray = useMemo<EChartsOption>(() => {
    const c = chrome(palette);
    const signed = rotationHistory
      .map((r) => [Date.parse(r.performed_at), r.direction === "left" ? -r.angle_degrees : r.angle_degrees] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const angle: [number, number][] = [];
    if (start != null && end != null) {
      const before = signed.filter(([ms]) => ms < start).at(-1);
      const inside = signed.filter(([ms]) => ms >= start && ms <= end);
      if (before) angle.push([start, before[1]]);
      angle.push(...inside);
      const current = inside.at(-1) ?? before;
      if (current) angle.push([end, current[1]]);
    }
    return {
      animationDurationUpdate: 300,
      grid: { top: 22, left: 40, right: 34, bottom: 24 },
      tooltip: { ...c.tooltip, trigger: "axis", axisPointer: c.pointer, valueFormatter: (v) => String(v) },
      xAxis: { ...c.time, min: start, max: end },
      yAxis: [
        { ...c.value("°"), scale: false, min: -90, max: 90, interval: 45, axisLabel: c.label },
        { ...c.value("pos.", "right"), scale: false, min: 0, max: capacity, interval: 1, axisLabel: c.label },
      ],
      series: [
        {
          name: "Posiciones ocupadas",
          type: "line",
          yAxisIndex: 1,
          step: "end",
          showSymbol: false,
          data: points.filter((p) => p.o != null).map((p) => [p.ms, p.o!]),
          lineStyle: { width: 1, color: alpha(palette.foreground, 0.5) },
          areaStyle: { color: fade(palette.foreground, 0.16) },
        },
        {
          name: "Ángulo de bandeja",
          type: "line",
          yAxisIndex: 0,
          step: "end",
          showSymbol: false,
          data: angle,
          lineStyle: { width: 2, color: palette.primary, ...glow(palette, palette.primary, 10) },
          itemStyle: { color: palette.primary },
          markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: alpha(palette.foreground, 0.3), type: "solid", width: 1 }, data: [{ yAxis: 0 }] },
        },
      ],
    };
  }, [capacity, end, palette, points, rotationHistory, start]);

  // 05 · Tiempo en rango: dos anillos de progreso concéntricos.
  const inRange = useMemo(() => {
    const share = (key: "t" | "h", min?: number, max?: number) => {
      if (!points.length || min == null || max == null) return null;
      const below = points.filter((p) => p[key] < min).length;
      const above = points.filter((p) => p[key] > max).length;
      const pct = (n: number) => Math.round((n / points.length) * 100);
      return { inside: pct(points.length - below - above), below: pct(below), above: pct(above) };
    };
    return {
      t: share("t", config?.temperature_min_c, config?.temperature_max_c),
      h: share("h", config?.humidity_min_pct, config?.humidity_max_pct),
    };
  }, [config, points]);

  const rings = useMemo<EChartsOption>(() => {
    const ring = (value: number, color: string, radius: string) => ({
      type: "gauge" as const,
      center: ["50%", "52%"],
      radius,
      startAngle: 90,
      endAngle: -270,
      min: 0,
      max: 100,
      pointer: { show: false },
      progress: { show: true, width: 9, roundCap: true, itemStyle: { color, ...glow(palette, color) } },
      axisLine: { lineStyle: { width: 9, color: [[1, alpha(palette.foreground, 0.08)]] as [number, string][] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: { show: false },
      title: { show: false },
      data: [{ value }],
    });
    // Escala de 60 marcas alrededor: el anillo se lee como un dial.
    const dial = {
      type: "gauge" as const,
      center: ["50%", "52%"],
      radius: "98%",
      startAngle: 90,
      endAngle: -270,
      splitNumber: 12,
      pointer: { show: false },
      axisLine: { show: false },
      axisTick: { distance: 0, length: 3, splitNumber: 5, lineStyle: { color: alpha(palette.foreground, 0.25), width: 1 } },
      splitLine: { distance: 0, length: 6, lineStyle: { color: alpha(palette.foreground, 0.45), width: 1 } },
      axisLabel: { show: false },
      detail: { show: false },
      data: [],
      silent: true,
    };
    return {
      animationDuration: 1100,
      animationDurationUpdate: 500,
      series: [
        dial,
        ring(inRange.t?.inside ?? 0, palette.warning, "84%"),
        ring(inRange.h?.inside ?? 0, palette.primary, "62%"),
      ],
    };
  }, [inRange, palette]);

  const empty = points.length ? null : "SIN LECTURAS REGISTRADAS";
  const source = demoActive ? "DE EJEMPLO" : "REALES";

  return (
    <section aria-label={demoActive ? "Historial de ejemplo" : "Historial de lecturas reales"}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-[12px] tracking-widest text-foreground-faint">
            TRAZAS DEL MICROCLIMA · {points.length} LECTURAS {source}
          </p>
          <h2 className="mt-2 text-2xl font-light">Cada lectura cuenta.</h2>
        </div>
        <div className="relative flex flex-wrap items-end gap-4">
          <ThemedSelect
            compact
            label="Lecturas"
            value={String(windowSize)}
            onValueChange={(value) => setWindowSize(Number(value))}
            options={[30, 120, 240].map((count) => ({ value: String(count), label: `Últimas ${count}` }))}
          />
          {/* Encima de las gráficas: abrirla no alarga el plano. */}
          <details className="text-xs">
            <summary className="cursor-pointer py-2 font-mono text-[11px] tracking-[0.1em] text-primary">
              VER VALORES
            </summary>
            <div className="absolute top-full right-0 z-10 mt-2 max-h-72 w-[min(420px,90vw)] overflow-auto border border-divider bg-panel p-3 shadow-lg">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    <th>°C</th>
                    <th>Humedad %</th>
                    <th>Ocupadas</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p, i) => (
                    <tr key={`${p.recordedAt}-${i}`}>
                      <td>{new Date(p.ms).toLocaleString("es-GT")}</td>
                      <td>{p.t.toFixed(1)}</td>
                      <td>{p.h.toFixed(1)}</td>
                      <td>{p.o ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-10 gap-y-7 lg:grid-cols-6">
        <Panel
          index="01"
          title="PULSO DEL MICROCLIMA"
          className="lg:col-span-4"
          meta={
            <>
              <Key color={palette.warning}>°C</Key>
              <Key color={palette.primary}>%</Key>
              <Key color={palette.faint} dashed>RANGO ÓPTIMO</Key>
              <Key color={palette.danger} dashed>CRÍTICO</Key>
            </>
          }
        >
          <div className="h-[270px]">
            <EChart
              option={pulse}
              empty={empty}
              label={`Temperatura y humedad de las últimas ${points.length} lecturas con el rango óptimo y el umbral crítico. Arrastra o usa la rueda para acercar. Valores en «Ver valores».`}
            />
          </div>
        </Panel>

        <Panel index="02" title="ESPACIO DE FASE" className="lg:col-span-2" meta="% × °C · ● AHORA">
          <div className="h-[270px]">
            <EChart
              option={phase}
              empty={empty}
              label="Cada lectura como punto de humedad y temperatura; los más recientes brillan más. El recuadro marca la zona óptima."
            />
          </div>
        </Panel>

        <Panel index="03" title="CRONOLOGÍA DE ALARMAS" className="lg:col-span-2" meta={<><Key color={palette.warning}>ADV.</Key><Key color={palette.danger}>CRÍTICA</Key></>}>
          <div className="h-[180px]">
            <EChart
              option={timeline}
              empty={alarmHistory.length ? null : "SIN ALARMAS REGISTRADAS"}
              label={`Episodios de alarma por tipo: ${ALARM_KINDS.map(([, name], lane) => `${name} ${alarmLanes.counts[lane]}`).join(", ")}.`}
            />
          </div>
        </Panel>

        <Panel index="04" title="BANDEJA Y OCUPACIÓN" className="lg:col-span-2" meta={<><Key color={palette.primary}>ÁNGULO</Key><Key color={palette.faint}>POSICIONES</Key></>}>
          <div className="h-[180px]">
            <EChart
              option={tray}
              empty={empty}
              label={`Ángulo de bandeja y posiciones ocupadas en la ventana. ${rotationHistory.length} giros registrados.`}
            />
          </div>
        </Panel>

        <Panel index="05" title="TIEMPO EN RANGO" className="lg:col-span-2">
          <div className="grid h-[180px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <EChart
              option={rings}
              empty={empty}
              label={`Lecturas en rango: temperatura ${inRange.t?.inside ?? "—"} %, humedad ${inRange.h?.inside ?? "—"} %.`}
            />
            <dl className="space-y-3 pr-1 font-mono text-[10px] tracking-[0.1em]">
              {([["TEMPERATURA", inRange.t, "text-warning"], ["HUMEDAD", inRange.h, "text-primary"]] as const).map(([name, value, color]) => (
                <div key={name}>
                  <dt className="text-foreground-faint">{name}</dt>
                  <dd className={`mt-0.5 font-display text-[28px] leading-none font-light tracking-tight ${color}`}>
                    {value ? value.inside : "—"}
                    <small className="ml-0.5 text-[12px]">%</small>
                  </dd>
                  <dd className="mt-1 text-foreground-faint">
                    {value ? `↓${value.below}  ↑${value.above}` : "SIN DATOS"}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Panel>
      </div>
    </section>
  );
}
