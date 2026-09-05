import type { SeriesPoint } from "./types";

/**
 * Deterministic telemetry synthesis.
 *
 * The generator is seeded so the server and the client produce byte-identical
 * markup on first paint (no hydration mismatch). Only the live tick started
 * from `useEffect` introduces real randomness.
 */

export const TICK_INTERVAL_MS = 2200;

export const LIVE_SERIES_LENGTH = 120;
export const LIVE_SERIES_SEED = 7;
export const HISTORY_SERIES_LENGTH = 240;
export const HISTORY_SERIES_SEED = 31;

/** 10:42:18 expressed in seconds — the clock the design boots at. */
export const CLOCK_ORIGIN_SECONDS = 38538;
export const CLOCK_STEP_SECONDS = 3;

const TEMP_TARGET = 37.55;
const HUM_TARGET = 58;

/** Linear congruential generator — small, fast and reproducible. */
export function createRandom(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/** Mean-reverting random walk around the incubator setpoints. */
export function createSeries(length: number, seed: number): SeriesPoint[] {
  const random = createRandom(seed);
  const out: SeriesPoint[] = [];
  let t = 37.5;
  let h = 57;

  for (let i = 0; i < length; i++) {
    t += (random() - 0.5) * 0.22 + (TEMP_TARGET - t) * 0.12;
    h += (random() - 0.5) * 1.6 + (HUM_TARGET - h) * 0.1;
    out.push({ t, h });
  }

  return out;
}

/** Drops the oldest sample and appends a fresh one. */
export function advanceSeries(
  series: SeriesPoint[],
  random: () => number = Math.random,
): SeriesPoint[] {
  const last = series[series.length - 1];
  return [
    ...series.slice(1),
    {
      t: last.t + (random() - 0.5) * 0.18 + (TEMP_TARGET - last.t) * 0.2,
      h: last.h + (random() - 0.5) * 1.2 + (HUM_TARGET - last.h) * 0.15,
    },
  ];
}

export function formatClock(tick: number): string {
  const base = CLOCK_ORIGIN_SECONDS + tick * CLOCK_STEP_SECONDS;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(base / 3600) % 24)}:${pad(Math.floor(base / 60) % 60)}:${pad(base % 60)}`;
}

/** Projects a series onto an SVG polyline path. */
export function seriesPath(
  points: SeriesPoint[],
  key: keyof SeriesPoint,
  min: number,
  max: number,
  width: number,
  height: number,
  pad = 4,
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const y =
      height -
      pad -
      ((points[0][key] - min) / (max - min)) * (height - pad * 2);
    return `M0 ${Math.max(0, Math.min(height, y)).toFixed(1)} L${width} ${Math.max(0, Math.min(height, y)).toFixed(1)}`;
  }
  return points
    .map((point, i) => {
      const x = (i / (points.length - 1)) * width;
      const y =
        height - pad - ((point[key] - min) / (max - min)) * (height - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)} ${Math.max(0, Math.min(height, y)).toFixed(1)}`;
    })
    .join(" ");
}

/** Static 24 h backdrop used by the history screen and the report sheet. */
export const HISTORY_SERIES = createSeries(
  HISTORY_SERIES_LENGTH,
  HISTORY_SERIES_SEED,
);

/** Seed for the rolling 6 h window shown on the control screen. */
export const INITIAL_LIVE_SERIES = createSeries(
  LIVE_SERIES_LENGTH,
  LIVE_SERIES_SEED,
);
