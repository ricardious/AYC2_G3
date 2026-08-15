/**
 * routes/lotes.js — CRUD de lotes de incubación.
 */

import { Router } from 'express';
import { db, registrarEvento } from '../db/index.js';
import { ahora, hoy } from '../config.js';
import { validar } from '../validacion.js';
import { ErrorHttp, asyncHandler } from '../middleware/errores.js';

const router = Router();

const ESQUEMA = {
  codigo: {
    tipo: 'texto', requerido: true, min: 3, max: 30,
    patron: /^[A-Za-z0-9-]+$/,
    mensajePatron: 'Sólo letras, números y guiones (ej. LOTE-2026-01)',
  },
  especie: { tipo: 'texto', requerido: true, min: 3, max: 40 },
  raza: { tipo: 'texto', requerido: false, max: 40 },
  origen: { tipo: 'texto', requerido: false, max: 80 },
  responsable: { tipo: 'texto', requerido: false, max: 80 },
  fecha_ingreso: { tipo: 'fecha', requerido: true },
  dias_incubacion: { tipo: 'entero', requerido: false, min: 1, max: 60, defecto: 21 },
  temperatura_objetivo: { tipo: 'numero', requerido: false, min: 30, max: 42, defecto: 37.5 },
  humedad_objetivo: { tipo: 'numero', requerido: false, min: 20, max: 90, defecto: 57.5 },
  notas: { tipo: 'texto', requerido: false, max: 500 },
  estado: {
    tipo: 'opcion', requerido: false,
    opciones: ['activo', 'finalizado', 'descartado'], defecto: 'activo',
  },
};

/** Añade campos calculados: días transcurridos y días restantes. */
function enriquecer(lote) {
  if (!lote) return lote;
  const ingreso = new Date(`${lote.fecha_ingreso}T00:00:00`);
  const dias = Math.floor((Date.now() - ingreso.getTime()) / 86_400_000);
  return {
    ...lote,
    dias_transcurridos: Math.max(0, dias),
    dias_restantes: Math.max(0, lote.dias_incubacion - dias),
    progreso: Math.min(100, Math.round((dias / lote.dias_incubacion) * 100)),
  };
}

/** GET /api/lotes?estado=activo */
router.get('/', asyncHandler((req, res) => {
  const { estado } = req.query;

  const sql = estado
    ? `SELECT l.*, (SELECT COUNT(*) FROM huevos h WHERE h.lote_id = l.id) AS total_huevos
       FROM lotes l WHERE l.estado = ? ORDER BY l.fecha_ingreso DESC`
    : `SELECT l.*, (SELECT COUNT(*) FROM huevos h WHERE h.lote_id = l.id) AS total_huevos
       FROM lotes l ORDER BY l.fecha_ingreso DESC`;

  const filas = estado ? db.prepare(sql).all(String(estado)) : db.prepare(sql).all();
  res.json({ ok: true, total: filas.length, lotes: filas.map(enriquecer) });
}));

/** GET /api/lotes/:id */
router.get('/:id', asyncHandler((req, res) => {
  const lote = db.prepare('SELECT * FROM lotes WHERE id = ?').get(req.params.id);
  if (!lote) throw new ErrorHttp(404, 'Lote no encontrado');

  const huevos = db.prepare(
    'SELECT * FROM huevos WHERE lote_id = ? ORDER BY posicion'
  ).all(lote.id);

  res.json({ ok: true, lote: { ...enriquecer(lote), huevos } });
}));

/** POST /api/lotes */
router.post('/', asyncHandler((req, res) => {
  const d = validar(req.body, ESQUEMA);

  const existe = db.prepare('SELECT 1 FROM lotes WHERE codigo = ?').get(d.codigo);
  if (existe) throw new ErrorHttp(409, `Ya existe un lote con el código ${d.codigo}`);

  if (d.fecha_ingreso > hoy()) {
    throw new ErrorHttp(400, 'La fecha de ingreso no puede ser futura', [
      { campo: 'fecha_ingreso', mensaje: 'No puede ser una fecha futura' },
    ]);
  }

  const info = db.prepare(`
    INSERT INTO lotes (codigo, especie, raza, origen, responsable, fecha_ingreso,
                       dias_incubacion, temperatura_objetivo, humedad_objetivo,
                       notas, estado, creado_en)
    VALUES (@codigo, @especie, @raza, @origen, @responsable, @fecha_ingreso,
            @dias_incubacion, @temperatura_objetivo, @humedad_objetivo,
            @notas, @estado, @creado_en)
  `).run({
    raza: null, origen: null, responsable: null, notas: null,
    ...d,
    creado_en: ahora(),
  });

  registrarEvento('lote', `Lote ${d.codigo} registrado (${d.especie})`);

  const lote = db.prepare('SELECT * FROM lotes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ok: true, lote: enriquecer(lote) });
}));

/** PUT /api/lotes/:id */
router.put('/:id', asyncHandler((req, res) => {
  const actual = db.prepare('SELECT * FROM lotes WHERE id = ?').get(req.params.id);
  if (!actual) throw new ErrorHttp(404, 'Lote no encontrado');

  const d = validar(req.body, ESQUEMA);

  const duplicado = db.prepare('SELECT 1 FROM lotes WHERE codigo = ? AND id != ?')
    .get(d.codigo, actual.id);
  if (duplicado) throw new ErrorHttp(409, `Ya existe otro lote con el código ${d.codigo}`);

  db.prepare(`
    UPDATE lotes SET codigo=@codigo, especie=@especie, raza=@raza, origen=@origen,
      responsable=@responsable, fecha_ingreso=@fecha_ingreso,
      dias_incubacion=@dias_incubacion, temperatura_objetivo=@temperatura_objetivo,
      humedad_objetivo=@humedad_objetivo, notas=@notas, estado=@estado,
      actualizado_en=@actualizado_en
    WHERE id=@id
  `).run({
    raza: null, origen: null, responsable: null, notas: null,
    ...d,
    id: actual.id,
    actualizado_en: ahora(),
  });

  const lote = db.prepare('SELECT * FROM lotes WHERE id = ?').get(actual.id);
  res.json({ ok: true, lote: enriquecer(lote) });
}));

/** DELETE /api/lotes/:id — borra también sus huevos (ON DELETE CASCADE) */
router.delete('/:id', asyncHandler((req, res) => {
  const lote = db.prepare('SELECT * FROM lotes WHERE id = ?').get(req.params.id);
  if (!lote) throw new ErrorHttp(404, 'Lote no encontrado');

  db.prepare('DELETE FROM lotes WHERE id = ?').run(lote.id);
  registrarEvento('lote', `Lote ${lote.codigo} eliminado`);

  res.json({ ok: true, mensaje: `Lote ${lote.codigo} eliminado` });
}));

export default router;
