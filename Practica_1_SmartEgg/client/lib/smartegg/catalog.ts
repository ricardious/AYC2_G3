import {
  DANGER,
  DANGER_SOFT,
  FOREGROUND_MUTED,
  PRIMARY,
  SUCCESS,
  WARNING,
} from "./theme";
import type {
  Particle,
  ScreenId,
  TimelineMark,
} from "./types";

/**
 * Static content of the node: fixtures that do not change with live state.
 * State-dependent projections live in `derive.ts`.
 */

/** The design is composed on a 1680 × 1000 stage and scaled to fit. */
export const STAGE_WIDTH = 1680;
export const STAGE_HEIGHT = 1000;
/** Breathing room subtracted before computing the scale. */
export const STAGE_GUTTER = 24;
export const STAGE_MIN_SCALE = 0.42;
export const STAGE_MAX_SCALE = 1;

/**
 * Tope del ensanchado elástico. Sin él, en 2560 px los huecos entre columnas
 * llegaban a 630 alrededor de una columna de 363. Pasado el tope el sobrante
 * vuelve a ser banda exterior.
 */
export const STAGE_MAX_STRETCH = 1.3;

export const NAV_ITEMS: readonly { id: ScreenId; label: string }[] = [
  { id: "control", label: "CENTRO DE CONTROL" },
  { id: "incubacion", label: "INCUBACIÓN" },
  { id: "historial", label: "HISTORIAL" },
  { id: "reportes", label: "REPORTES" },
  { id: "config", label: "CONFIGURACIÓN" },
];

/** `[kicker, title]` shown in the screen header. */
export const SCREEN_TITLES: Record<ScreenId, readonly [string, string]> = {
  control: ["NODO 01 · LOTE A", "SMART EGG CONTROL CORE"],
  incubacion: ["ESTACIÓN DE ESPECÍMENES", "INCUBACIÓN"],
  historial: ["LABORATORIO DE TELEMETRÍA", "HISTORIAL"],
  reportes: ["DOCUMENTACIÓN DE CICLO", "REPORTES"],
  config: ["PARÁMETROS DEL NODO", "CONFIGURACIÓN"],
};

const TIMELINE_LABELS = [
  "10:00",
  "13:00",
  "16:00",
  "19:00",
  "22:00",
  "01:00",
  "04:00",
  "07:00",
];

export const TIMELINE: readonly TimelineMark[] = [
  0, 12, 24, 36, 48, 62, 74, 88,
].map((pct, i) => ({
  pct,
  height: i % 2 ? 6 : 12,
  color: i === 5 ? DANGER : "rgba(150,180,195,.35)",
  label: TIMELINE_LABELS[i],
}));

/** Drifting dust motes over the backdrop — positions are deterministic. */
export const PARTICLES: readonly Particle[] = Array.from(
  { length: 16 },
  (_, i) => ({
    x: 6 + ((i * 37) % 88),
    y: 40 + ((i * 53) % 55),
    duration: 16 + (i % 7) * 3,
    delay: Number((i * 1.7).toFixed(1)),
  }),
);

/** Node facts shown on the settings screen. */
export const NODE_INFO: readonly { label: string; value: string; color: string }[] =
  [
    { label: "FIRMWARE", value: "2.4.1", color: FOREGROUND_MUTED },
    { label: "PROTOCOLO", value: "MQTT / TLS", color: FOREGROUND_MUTED },
    { label: "LATENCIA", value: "42 ms", color: SUCCESS },
  ];

/** Aggregates of the 24 h window, shown at the top of the history screen. */
export const HISTORY_STATS: readonly {
  label: string;
  value: string;
  color: string;
}[] = [
  { label: "MÁX TEMP", value: "38.4 °C", color: WARNING },
  { label: "MÍN TEMP", value: "36.9 °C", color: WARNING },
  { label: "MÁX HUM", value: "64 %", color: PRIMARY },
  { label: "MÍN HUM", value: "51 %", color: PRIMARY },
  { label: "ROTACIONES", value: "48", color: FOREGROUND_MUTED },
  { label: "ALERTAS", value: "01", color: DANGER_SOFT },
];

/** Summary block of the printed report. */
export const REPORT_FIELDS: readonly { label: string; value: string }[] = [
  { label: "LOTE", value: "A" },
  { label: "HUEVOS ACTIVOS", value: "0" },
  { label: "TEMPERATURA PROMEDIO", value: "37.6 °C" },
  { label: "HUMEDAD PROMEDIO", value: "58 %" },
  { label: "ROTACIONES REGISTRADAS", value: "48" },
];

/** Left rail of the incubation screen. */
export const STATION_META: readonly { label: string; value: string; color: string }[] =
  [
    { label: "ESTACIÓN", value: "ANÁLISIS 01", color: FOREGROUND_MUTED },
    { label: "OCUPACIÓN", value: "0 / 4", color: SUCCESS },
    { label: "DÍA DE CICLO", value: "05 / 21", color: FOREGROUND_MUTED },
    { label: "ECLOSIÓN EST.", value: "27 AGO 2026", color: FOREGROUND_MUTED },
  ];
