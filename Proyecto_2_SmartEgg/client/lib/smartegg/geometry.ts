/**
 * SVG path builders for the instrument graphics.
 *
 * Everything that does not depend on live state is computed once at module
 * evaluation and exported as a constant.
 */

/* ------------------------------------------------------------------ gauge */

const GAUGE_CX = 145;
const GAUGE_CY = 150;
const GAUGE_R = 105;

/** Length of the half-circle the value arc is drawn along. */
export const GAUGE_CIRCUMFERENCE = Math.PI * GAUGE_R;

export const GAUGE_OUTLINE_PATH = "M 24 150 A 121 121 0 0 1 266 150";
export const GAUGE_TRACK_PATH = "M 40 150 A 105 105 0 0 1 250 150";

/** Scale bounds of the temperature dial, in °C. */
export const GAUGE_MIN_C = 35;
export const GAUGE_MAX_C = 41;

function polar(angle: number, radius = GAUGE_R): [number, number] {
  return [
    GAUGE_CX + radius * Math.cos(angle),
    GAUGE_CY - radius * Math.sin(angle),
  ];
}

/** Arc between two angles measured from the left end of the dial. */
export function gaugeArcSegment(from: number, to: number): string {
  const [x0, y0] = polar(Math.PI - from);
  const [x1, y1] = polar(Math.PI - to);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

/** Green band marking the 37–38 °C optimal window. */
export const GAUGE_OPTIMAL_PATH = gaugeArcSegment(
  Math.PI * (2 / 6),
  Math.PI * (3 / 6),
);

export const GAUGE_TICKS_PATH = (() => {
  let path = "";
  for (let i = 0; i <= 30; i++) {
    const angle = Math.PI * (1 - i / 30);
    const inner = 122;
    const outer = i % 5 === 0 ? 133 : 128;
    const [x0, y0] = polar(angle, inner);
    const [x1, y1] = polar(angle, outer);
    path += `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} `;
  }
  return path.trimEnd();
})();

export function gaugeFraction(temperature: number): number {
  return Math.max(
    0,
    Math.min(1, (temperature - GAUGE_MIN_C) / (GAUGE_MAX_C - GAUGE_MIN_C)),
  );
}

export function gaugeDashArray(fraction: number): string {
  return `${(GAUGE_CIRCUMFERENCE * fraction).toFixed(1)} ${GAUGE_CIRCUMFERENCE.toFixed(1)}`;
}

/** Position of the needle head for a given fill fraction. */
export function gaugeNeedle(fraction: number): { cx: string; cy: string } {
  const [x, y] = polar(Math.PI * (1 - fraction));
  return { cx: x.toFixed(1), cy: y.toFixed(1) };
}

/* --------------------------------------------------------------- platform */

/** Radial graticule of the tray-angle platform (480 × 150 viewBox). */
export const RADIAL_TICKS_PATH = (() => {
  let path = "";
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const inner = i % 4 === 0 ? 196 : 210;
    const outer = 238;
    const x0 = 240 + inner * Math.cos(angle) * 0.99;
    const y0 = 75 + inner * Math.sin(angle) * 0.31;
    const x1 = 240 + outer * Math.cos(angle) * 0.99;
    const y1 = 75 + outer * Math.sin(angle) * 0.31;
    path += `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} `;
  }
  return path.trimEnd();
})();

/* ----------------------------------------------------------------- charts */

/** Grid of the 6 h telemetry chart (496 × 132 viewBox). */
export const TELEMETRY_GRID_PATH = (() => {
  let path = "";
  for (let i = 1; i < 8; i++) path += `M ${i * 62} 0 L ${i * 62} 132 `;
  for (let i = 1; i < 4; i++) path += `M 0 ${i * 33} L 496 ${i * 33} `;
  return path.trimEnd();
})();

/** Grid of the 24 h history charts (1440 wide viewBox). */
export const HISTORY_GRID_PATH = (() => {
  let path = "";
  for (let i = 1; i < 24; i++) path += `M ${i * 60} 0 L ${i * 60} 180 `;
  return path.trimEnd();
})();

/* -------------------------------------------------------------- humidity */

export const HUMIDITY_COLUMN_HEIGHT = 212;
/** Optimal humidity window: 50–65 %. */
export const HUMIDITY_OPTIMAL_TOP = Math.round(
  HUMIDITY_COLUMN_HEIGHT - 0.65 * HUMIDITY_COLUMN_HEIGHT,
);
export const HUMIDITY_OPTIMAL_HEIGHT = Math.round(
  0.15 * HUMIDITY_COLUMN_HEIGHT,
);

export function humidityFillHeight(humidity: number): number {
  return Math.round((humidity / 100) * HUMIDITY_COLUMN_HEIGHT);
}
