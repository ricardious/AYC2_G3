/**
 * routes/lecturas.js — historial de sensores y resúmenes estadísticos.
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { hoy } from '../config.js';
import { asyncHandler } from '../middleware/errores.js';

const router = Router();

/**
 * GET /api/lecturas?limite=200&desde=...&hasta=...
 * Devuelve el historial, de la más reciente a la más antigua.
 */
router.get('/', asyncHandler((req, res) => {
  const limite = Math.min(Number(req.query.limite ?? 200) || 200, 5000);
  const { desde, hasta } = req.query;

  let sql = 'SELECT * FROM lecturas';
  const params = [];
  const filtros = [];

  if (desde) { filtros.push('ts >= ?'); params.push(String(desde)); }
  if (hasta) { filtros.push('ts <= ?'); params.push(String(hasta)); }
  if (filtros.length) sql += ` WHERE ${filtros.join(' AND ')}`;

  sql += ' ORDER BY ts DESC LIMIT ?';
  params.push(limite);

  const filas = db.prepare(sql).all(...params);
  res.json({ ok: true, total: filas.length, lecturas: filas });
}));

/**
 * GET /api/lecturas/serie?minutos=60
 * Serie temporal en orden cronológico, pensada para las gráficas.
 */
router.get('/serie', asyncHandler((req, res) => {
  const minutos = Math.min(Number(req.query.minutos ?? 60) || 60, 1440);
  const desde = new Date(Date.now() - minutos * 60_000);
  const p = (n) => String(n).padStart(2, '0');
  const desdeSql =
    `${desde.getFullYear()}-${p(desde.getMonth() + 1)}-${p(desde.getDate())} ` +
    `${p(desde.getHours())}:${p(desde.getMinutes())}:${p(desde.getSeconds())}`;

  const filas = db.prepare(
    `SELECT ts, temperatura, humedad, calefaccion, ventilador, alarma
     FROM lecturas WHERE ts >= ? ORDER BY ts ASC`
  ).all(desdeSql);

  res.json({ ok: true, minutos, total: filas.length, serie: filas });
}));

/**
 * GET /api/lecturas/resumen?fecha=AAAA-MM-DD
 * Máximas, mínimas y promedios del día — es lo que consume el reporte PDF.
 */
router.get('/resumen', asyncHandler((req, res) => {
  const fecha = String(req.query.fecha ?? hoy());

  const resumen = db.prepare(`
    SELECT
      COUNT(*)                  AS muestras,
      MAX(temperatura)          AS temp_max,
      MIN(temperatura)          AS temp_min,
      ROUND(AVG(temperatura),2) AS temp_prom,
      MAX(humedad)              AS hum_max,
      MIN(humedad)              AS hum_min,
      ROUND(AVG(humedad),2)     AS hum_prom,
      SUM(calefaccion)          AS ciclos_calefaccion,
      SUM(ventilador)           AS ciclos_ventilador,
      MAX(rotaciones)           AS rotaciones
    FROM lecturas
    WHERE date(ts) = ? AND sensor_ok = 1
  `).get(fecha);

  const porHora = db.prepare(`
    SELECT
      strftime('%H:00', ts)     AS hora,
      ROUND(AVG(temperatura),2) AS temp_prom,
      MAX(temperatura)          AS temp_max,
      MIN(temperatura)          AS temp_min,
      ROUND(AVG(humedad),2)     AS hum_prom
    FROM lecturas
    WHERE date(ts) = ? AND sensor_ok = 1
    GROUP BY strftime('%H', ts)
    ORDER BY hora
  `).all(fecha);

  res.json({ ok: true, fecha, resumen, porHora });
}));

/** DELETE /api/lecturas — limpia el historial (útil antes de la demo) */
router.delete('/', asyncHandler((req, res) => {
  const info = db.prepare('DELETE FROM lecturas').run();
  res.json({ ok: true, eliminadas: info.changes });
}));

export default router;
