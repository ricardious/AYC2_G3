/**
 * routes/alarmas.js — registro histórico de alarmas y eventos.
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { ahora, hoy } from '../config.js';
import { ErrorHttp, asyncHandler } from '../middleware/errores.js';

const router = Router();

/** GET /api/alarmas?resueltas=0&fecha=AAAA-MM-DD&limite=100 */
router.get('/', asyncHandler((req, res) => {
  const limite = Math.min(Number(req.query.limite ?? 100) || 100, 1000);
  const filtros = [];
  const params = [];

  if (req.query.resueltas !== undefined) {
    filtros.push('resuelta = ?');
    params.push(Number(req.query.resueltas) ? 1 : 0);
  }
  if (req.query.fecha) {
    filtros.push('date(ts) = ?');
    params.push(String(req.query.fecha));
  }

  const sql = 'SELECT * FROM alarmas'
    + (filtros.length ? ` WHERE ${filtros.join(' AND ')}` : '')
    + ' ORDER BY ts DESC LIMIT ?';

  const filas = db.prepare(sql).all(...params, limite);
  res.json({ ok: true, total: filas.length, alarmas: filas });
}));

/** GET /api/alarmas/activas — las que siguen sin resolverse */
router.get('/activas', asyncHandler((req, res) => {
  const filas = db.prepare(
    'SELECT * FROM alarmas WHERE resuelta = 0 ORDER BY ts DESC'
  ).all();
  res.json({ ok: true, total: filas.length, alarmas: filas });
}));

/**
 * GET /api/alarmas/resumen?fecha=AAAA-MM-DD
 * Conteo por tipo, para el reporte PDF.
 */
router.get('/resumen', asyncHandler((req, res) => {
  const fecha = String(req.query.fecha ?? hoy());

  const porTipo = db.prepare(`
    SELECT tipo, severidad, COUNT(*) AS total, MAX(ts) AS ultima
    FROM alarmas WHERE date(ts) = ?
    GROUP BY tipo, severidad ORDER BY total DESC
  `).all(fecha);

  const total = porTipo.reduce((s, f) => s + f.total, 0);

  res.json({ ok: true, fecha, total, porTipo });
}));

/** PATCH /api/alarmas/:id/resolver */
router.patch('/:id/resolver', asyncHandler((req, res) => {
  const alarma = db.prepare('SELECT * FROM alarmas WHERE id = ?').get(req.params.id);
  if (!alarma) throw new ErrorHttp(404, 'Alarma no encontrada');

  db.prepare('UPDATE alarmas SET resuelta = 1, ts_resuelta = ? WHERE id = ?')
    .run(ahora(), alarma.id);

  res.json({ ok: true, mensaje: 'Alarma marcada como resuelta' });
}));

/** GET /api/alarmas/eventos — bitácora general del sistema */
router.get('/eventos', asyncHandler((req, res) => {
  const limite = Math.min(Number(req.query.limite ?? 100) || 100, 1000);
  const filas = req.query.fecha
    ? db.prepare('SELECT * FROM eventos WHERE date(ts) = ? ORDER BY ts DESC LIMIT ?')
        .all(String(req.query.fecha), limite)
    : db.prepare('SELECT * FROM eventos ORDER BY ts DESC LIMIT ?').all(limite);

  res.json({ ok: true, total: filas.length, eventos: filas });
}));

export default router;
