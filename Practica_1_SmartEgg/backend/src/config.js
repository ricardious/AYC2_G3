/**
 * config.js — configuración central del backend.
 * Lee el archivo .env (si existe) y aplica valores por defecto sensatos.
 */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

export const config = {
  puerto: Number(process.env.PUERTO ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',

  serial: {
    puerto: process.env.SERIAL_PUERTO ?? 'AUTO',
    baudios: Number(process.env.SERIAL_BAUDIOS ?? 115200),
    reintentoMs: 3000,
  },

  // --simular en la línea de comandos gana sobre el .env
  simular: args.includes('--simular') || process.env.SIMULAR === '1',

  db: {
    archivo: path.resolve(RAIZ, process.env.DB_ARCHIVO ?? './data/smartegg.db'),
  },

  guardarCadaMs: Number(process.env.GUARDAR_CADA_MS ?? 5000),

  corsOrigen: (process.env.CORS_ORIGEN ?? '*') === '*'
    ? '*'
    : (process.env.CORS_ORIGEN ?? '').split(',').map((o) => o.trim()),

  totalEspacios: 4,
};

/** Devuelve la fecha/hora local en formato SQLite: 'YYYY-MM-DD HH:MM:SS'. */
export function ahora(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())} ` +
    `${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}`
  );
}

/** Devuelve solo la fecha local en formato 'YYYY-MM-DD'. */
export function hoy(fecha = new Date()) {
  return ahora(fecha).slice(0, 10);
}
