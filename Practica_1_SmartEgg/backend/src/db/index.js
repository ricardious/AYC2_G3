/**
 * db/index.js — conexión a SQLite y creación del esquema.
 *
 * Se eligió SQLite porque no necesita instalar ningún servidor: el archivo
 * `data/smartegg.db` es la base de datos completa. Cualquier integrante del
 * equipo clona el repositorio, corre `npm install` y ya tiene BD funcionando.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, ahora } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Crear la carpeta data/ si no existe
fs.mkdirSync(path.dirname(config.db.archivo), { recursive: true });

export const db = new Database(config.db.archivo);

db.pragma('journal_mode = WAL');   // permite leer mientras se escribe
db.pragma('foreign_keys = ON');

// Aplicar el esquema (todas las sentencias son IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---------------------------------------------------------------------------
//  Valores de configuración por defecto
// ---------------------------------------------------------------------------
const UMBRALES_DEFECTO = {
  temp_min: { valor: '37.0', descripcion: 'Temperatura mínima (°C)' },
  temp_max: { valor: '38.0', descripcion: 'Temperatura máxima (°C)' },
  temp_critica: { valor: '39.5', descripcion: 'Temperatura crítica (°C)' },
  hum_min: { valor: '50.0', descripcion: 'Humedad mínima (%)' },
  hum_max: { valor: '65.0', descripcion: 'Humedad máxima (%)' },
  rotacion_minutos: { valor: '2', descripcion: 'Periodo de rotación (min)' },
};

const insertarConfig = db.prepare(
  `INSERT OR IGNORE INTO configuracion (clave, valor, descripcion, actualizado_en)
   VALUES (?, ?, ?, ?)`
);

for (const [clave, { valor, descripcion }] of Object.entries(UMBRALES_DEFECTO)) {
  insertarConfig.run(clave, valor, descripcion, ahora());
}

// ---------------------------------------------------------------------------
//  Técnico por defecto, para poder entrar la primera vez
// ---------------------------------------------------------------------------
const hayTecnicos = db.prepare('SELECT COUNT(*) AS n FROM tecnicos').get().n;
if (hayTecnicos === 0) {
  db.prepare(
    `INSERT INTO tecnicos (nombre, usuario, pin, carne, rol, creado_en)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('Técnico de turno', 'agronomo', '1234', '—', 'tecnico', ahora());
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Lee todos los umbrales como objeto de números. */
export function leerUmbrales() {
  const filas = db.prepare('SELECT clave, valor FROM configuracion').all();
  const salida = {};
  for (const f of filas) salida[f.clave] = Number(f.valor);
  return salida;
}

/** Guarda un umbral. */
export function guardarUmbral(clave, valor) {
  db.prepare(
    `INSERT INTO configuracion (clave, valor, actualizado_en) VALUES (?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor,
                                      actualizado_en = excluded.actualizado_en`
  ).run(clave, String(valor), ahora());
}

/** Registra un evento del sistema. */
export function registrarEvento(tipo, descripcion, valor = null) {
  db.prepare(
    'INSERT INTO eventos (ts, tipo, descripcion, valor) VALUES (?, ?, ?, ?)'
  ).run(ahora(), tipo, descripcion, valor);
}

export default db;
