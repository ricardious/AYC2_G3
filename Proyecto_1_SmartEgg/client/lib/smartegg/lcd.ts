import type { SceneState } from "./observatory3d";

// Port of composeRunning and CGRAM bitmaps in firmware/SmartEggESP32/Display.cpp.
// Unknown firmware states stay unknown; connectivity is not the power switch.
const ThermometerBitmap = [4,10,10,14,14,31,31,14];
const DropletBitmap = [4,4,14,14,31,31,31,14];
const SlotFullBitmap = [0,4,14,14,31,31,31,14];
const SlotEmptyBitmap = [0,4,10,10,17,17,17,14];
const DoorOpenBitmap = [15,9,9,11,9,9,9,15];
const HeaterBitmaps = [[4,6,12,14,31,31,14,0],[4,12,6,14,31,31,14,0],[4,4,14,14,31,31,31,14]];
const FanBitmaps = [[0,0,0,31,0,0,0,0],[16,8,8,4,2,2,1,0],[4,4,4,4,4,4,4,0],[1,2,2,4,8,8,16,0]];
const AlarmBitmaps = [[4,14,14,14,31,0,4,0],[2,6,14,14,31,0,8,0],[4,14,14,14,31,0,4,0],[8,12,14,14,31,0,2,0]];

export function composeLcd(s: Pick<SceneState, "temperature" | "humidity" | "occupied" | "angle" | "doorOpen" | "heater" | "fan" | "buzzer"> & Partial<Pick<SceneState, "systemEnabled" | "sensorOk">>, frame: number, marqueeOffset = 0): string[] {
  const rows = [Array<string>(16).fill(" "), Array<string>(16).fill(" ")];
  const put = (row: number, col: number, text: string) => {
    [...text].forEach((char, i) => { if (col + i < 16) rows[row][col + i] = char; });
  };
  const integer = (row: number, col: number, width: number, value: number, sign = false) => {
    const digits = String(Math.abs(Math.trunc(value))).slice(-width);
    const prefix = value < 0 ? "-" : sign ? "+" : "";
    put(row, col, (digits.length < width ? prefix + digits : digits).padStart(width));
  };
  if (s.systemEnabled === false) {
    put(0, 0, "SISTEMA APAGADO");
    put(0, 15, [" ", ".", "o", "O", "o", "."][Math.floor(frame / 3) % 6]);
    for (let i = 0; i < 4; i++) put(1, i, i < s.occupied ? "\x05" : "\x06");
    put(1, 5, "Libres:");
    integer(1, 12, 1, 4 - s.occupied);
    if (s.doorOpen) put(1, 15, "\x07");
    return rows.map(row => row.join(""));
  }
  if (s.sensorOk === false) {
    put(0, 0, "ERROR SENSOR DHT");
    const message = "Revise DATA en GPIO15, 3.3V y GND comun.   ";
    for (let i = 0; i < 16; i++) put(1, i, message[(marqueeOffset + i) % message.length]);
    return rows.map(row => row.join(""));
  }
  put(0, 0, "\x00");
  if (s.temperature !== null && Number.isFinite(s.temperature)) {
    const t = Math.max(-400, Math.min(999, Math.trunc(Math.fround(Math.fround(s.temperature * 10) + (s.temperature < 0 ? -0.5 : 0.5)))));
    integer(0, 1, 3, Math.trunc(t / 10));
    put(0, 4, "." + Math.abs(t % 10));
  } else put(0, 1, " --.-");
  put(0, 6, "°C");
  put(0, 9, "\x01");
  if (s.humidity !== null && Number.isFinite(s.humidity)) integer(0, 10, 3, Math.max(0, Math.min(100, Math.trunc(s.humidity + 0.5))));
  else put(0, 10, " --");
  put(0, 13, "%");
  if (s.doorOpen) put(0, 15, "\x07");
  for (let i = 0; i < 4; i++) put(1, i, i < s.occupied ? "\x05" : "\x06");
  if (s.angle !== null) integer(1, 6, 3, s.angle, s.angle > 0);
  else put(1, 6, " --");
  put(1, 9, "°");
  if (s.heater) put(1, 12, "\x02");
  if (s.fan) put(1, 13, "\x03");
  if (s.buzzer && (frame & 2) !== 0) put(1, 14, "\x04");
  return rows.map(row => row.join(""));
}

export function drawLcd(ctx: CanvasRenderingContext2D, rows: string[], frame: number) {
  const glyphs = [ThermometerBitmap, DropletBitmap, HeaterBitmaps[frame % 3], FanBitmaps[frame % 4], AlarmBitmaps[frame % 4], SlotFullBitmap, SlotEmptyBitmap, DoorOpenBitmap];
  ctx.fillStyle = "#102b65";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#c6eeff";
  ctx.font = "36px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  rows.forEach((row, y) => [...row].forEach((char, x) => {
    const bitmap = glyphs[char.charCodeAt(0)];
    const left = 12 + x * 30, top = 12 + y * 58;
    if (bitmap) {
      bitmap.forEach((bits, py) => {
        for (let px = 0; px < 5; px++) if (bits & (1 << (4 - px))) ctx.fillRect(left + px * 5, top + py * 5, 4, 4);
      });
    } else ctx.fillText(char, left + 12, top + 21);
  }));
}
