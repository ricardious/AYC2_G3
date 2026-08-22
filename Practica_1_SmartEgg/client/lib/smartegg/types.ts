import type { CSSProperties } from "react";

/**
 * Domain types for the SmartEgg control console.
 *
 * These mirror the data model of the original Claude Design document
 * (`SmartEgg Control Core.dc.html`) but are expressed as explicit,
 * serialisable types instead of ad-hoc template values.
 */

export type ScreenId =
  | "control"
  | "incubacion"
  | "historial"
  | "reportes"
  | "config";

export type ComponentId =
  | "ventilador"
  | "calefaccion"
  | "servo"
  | "buzzer"
  | "dht"
  | "limit"
  | "slots"
  | "bandeja";

export type Selection =
  | { type: "component"; id: ComponentId }
  | { type: "egg"; id: string }
  | { type: "slot" }
  | null;

/** A physical egg (or an empty tray position) registered in the node. */
export interface EggRecord {
  code: string;
  lote: string;
  pos: string;
  dia: number;
  estado: string;
  empty: boolean;
}

/** Presentation model derived from an {@link EggRecord} plus UI state. */
export interface EggView {
  /** Stable identity — matches `EggRecord.code`. */
  id: string;
  /** Display label (long slot names are abbreviated). */
  label: string;
  line2: string;
  line3: string;
  stateColor: string;
  empty: boolean;
  /** Hovered or currently selected — drives the cyan highlight treatment. */
  hot: boolean;
  /** Hovered specifically — drives the chamber tooltip. */
  hovered: boolean;
}

/** One sample of the incubator telemetry stream. */
export interface SeriesPoint {
  /** Temperature in °C. */
  t: number;
  /** Relative humidity in %. */
  h: number;
}

export interface DetailRow {
  label: string;
  value: string;
  color: string;
}

export interface DetailPanel {
  kicker: string;
  title: string;
  accent: string;
  rows: DetailRow[];
}

export interface HeaderStat {
  label: string;
  value: string;
  color: string;
  dot: string;
}

/** Cadencia del punto de estado; el componente la traduce a `animate-*`. */
export type ActuatorPulse = "fan" | "heater" | "servo" | "alarm" | "none";

export interface ActuatorView {
  id: ComponentId;
  name: string;
  state: string;
  metric: string;
  color: string;
  pulse: ActuatorPulse;
}

export interface SensorView {
  id: ComponentId;
  name: string;
  state: string;
  color: string;
  /** Pulse offset in seconds, so the three dots breathe out of phase. */
  delay: number;
}

export interface HotspotView {
  id: ComponentId;
  label: string;
  state: string;
  stateColor: string;
  x: number;
  y: number;
  align: "left" | "right";
}

export interface EventView {
  time: string;
  kind: string;
  text: string;
  color: string;
}

export interface TimelineMark {
  pct: number;
  height: number;
  color: string;
  label: string;
}

export interface Particle {
  x: number;
  y: number;
  duration: number;
  delay: number;
}

/**
 * Tunables exposed by the original design as editable props.
 * Surfaced here as the public API of `<SmartEggDashboard />`.
 */
export interface SmartEggConfig {
  /** Force the thermal-alarm state on, independent of the in-app toggle. */
  criticalMode: boolean;
  /** Opacity of the animated airflow streamlines, 0–1. */
  airflowIntensity: number;
  /** Render the drifting dust particles over the backdrop. */
  showParticles: boolean;
  /** Name shown in the header and on the generated report. */
  technician: string;
}

/** `CSSProperties` widened to accept custom properties. */
export type CSSVars = CSSProperties & {
  [key: `--${string}`]: string | number | undefined;
};
