/**
 * routes/reportes.js — datos consolidados para el informe PDF.
 *
 * El PDF se arma en el frontend (con jsPDF) para poder incluir el logo y
 * descargarlo automáticamente; aquí se prepara todo lo que necesita en una
 * sola llamada, tal como lo pide el enunciado:
 *   · datos del técnico autenticado
 *   · resumen de los lotes actuales
 *   · historial de temperaturas máximas/mínimas del día
 *   · registro de alarmas
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { config, ahora, hoy } from '../config.js';
import { instantanea } from '../estado.js';
import { asyncHandler } from '../middleware/errores.js';

const router = Router();

/** GET /api/reportes/diario?fecha=AAAA-MM-DD&tecnico_id=1 */
router.get('/diario', asyncHandler((req, res) => {
  const fecha = String(req.query.fecha ?? hoy());
  const tecnicoId = req.query.tecnico_id ? Number(req.query.tecnico_id) : null;

  // --- Técnico autenticado ---
  const tecnico = tecnicoId
    ? db.prepare('SELECT id, nombre, usuario, carne, rol FROM tecnicos WHERE id = ?').get(tecnicoId)
    : null;

  // --- Resumen ambiental del día ---
  const ambiental = db.prepare(`
    SELECT
      COUNT(*)                  AS muestras,
      MAX(temperatura)          AS temp_max,
      MIN(temperatura)          AS temp_min,
      ROUND(AVG(temperatura),2) AS temp_prom,
      MAX(humedad)              AS hum_max,
      MIN(humedad)              AS hum_min,
      ROUND(AVG(humedad),2)     AS hum_prom,
      MAX(rotaciones)           AS rotaciones
    FROM lecturas
    WHERE date(ts) = ? AND sensor_ok = 1
  `).get(fecha);

  // Momento exacto de la máxima y de la mínima (dato bonito para el informe)
  const picoMax = db.prepare(
    `SELECT ts, temperatura, humedad FROM lecturas
     WHERE date(ts) = ? AND sensor_ok = 1 ORDER BY temperatura DESC LIMIT 1`
  ).get(fecha);

  const picoMin = db.prepare(
    `SELECT ts, temperatura, humedad FROM lecturas
     WHERE date(ts) = ? AND sensor_ok = 1 ORDER BY temperatura ASC LIMIT 1`
  ).get(fecha);

  // --- Historial por hora ---
  const porHora = db.prepare(`
    SELECT
      strftime('%H:00', ts)     AS hora,
      MAX(temperatura)          AS temp_max,
      MIN(temperatura)          AS temp_min,
      ROUND(AVG(temperatura),2) AS temp_prom,
      MAX(humedad)              AS hum_max,
      MIN(humedad)              AS hum_min,
      COUNT(*)                  AS muestras
    FROM lecturas
    WHERE date(ts) = ? AND sensor_ok = 1
    GROUP BY strftime('%H', ts)
    ORDER BY hora
  `).all(fecha);

  // --- Lotes actuales con su conteo de huevos ---
  const lotes = db.prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM huevos h WHERE h.lote_id = l.id) AS total_huevos,
      (SELECT COUNT(*) FROM huevos h WHERE h.lote_id = l.id AND h.estado = 'incubando')   AS incubando,
      (SELECT COUNT(*) FROM huevos h WHERE h.lote_id = l.id AND h.estado = 'eclosionado') AS eclosionados,
      (SELECT COUNT(*) FROM huevos h WHERE h.lote_id = l.id AND h.estado = 'descartado')  AS descartados
    FROM lotes l
    WHERE l.estado = 'activo'
    ORDER BY l.fecha_ingreso DESC
  `).all().map((l) => {
    const dias = Math.floor((Date.now() - new Date(`${l.fecha_ingreso}T00:00:00`).getTime()) / 86_400_000);
    return {
      ...l,
      dias_transcurridos: Math.max(0, dias),
      dias_restantes: Math.max(0, l.dias_incubacion - dias),
    };
  });

  // --- Ocupación de las 4 posiciones ---
  const huevosActivos = db.prepare(`
    SELECT h.*, l.codigo AS lote_codigo FROM huevos h
    JOIN lotes l ON l.id = h.lote_id
    WHERE h.estado = 'incubando' ORDER BY h.posicion
  `).all();

  const ocupacion = [];
  for (let i = 1; i <= config.totalEspacios; i++) {
    const huevo = huevosActivos.find((h) => h.posicion === i) ?? null;
    ocupacion.push({ posicion: i, ocupado: Boolean(huevo), huevo });
  }

  // --- Alarmas del día ---
  const alarmas = db.prepare(
    'SELECT * FROM alarmas WHERE date(ts) = ? ORDER BY ts DESC'
  ).all(fecha);

  const alarmasPorTipo = db.prepare(`
    SELECT tipo, severidad, COUNT(*) AS total
    FROM alarmas WHERE date(ts) = ?
    GROUP BY tipo, severidad ORDER BY total DESC
  `).all(fecha);

  // --- Bitácora ---
  const eventos = db.prepare(
    'SELECT * FROM eventos WHERE date(ts) = ? ORDER BY ts DESC LIMIT 60'
  ).all(fecha);

  res.json({
    ok: true,
    reporte: {
      titulo: 'Informe diario de incubación — SmartEgg',
      institucion: 'Universidad de San Carlos de Guatemala',
      facultad: 'Facultad de Ingeniería · Ciencias y Sistemas',
      curso: 'Arquitectura de Computadoras y Ensambladores 2',
      grupo: 'Grupo 3',
      fecha,
      generado_en: ahora(),
      tecnico,
      ambiental: {
        ...ambiental,
        pico_maximo: picoMax ?? null,
        pico_minimo: picoMin ?? null,
        rango_objetivo: { temp_min: 37.0, temp_max: 38.0, hum_min: 50, hum_max: 65 },
      },
      por_hora: porHora,
      lotes,
      ocupacion: {
        total_espacios: config.totalEspacios,
        ocupados: huevosActivos.length,
        libres: config.totalEspacios - huevosActivos.length,
        detalle: ocupacion,
      },
      alarmas,
      alarmas_por_tipo: alarmasPorTipo,
      total_alarmas: alarmas.length,
      eventos,
      estado_actual: instantanea(),
    },
  });
}));

/** GET /api/reportes/fechas — días que tienen datos (para el selector) */
router.get('/fechas', asyncHandler((req, res) => {
  const filas = db.prepare(`
    SELECT date(ts) AS fecha, COUNT(*) AS muestras
    FROM lecturas GROUP BY date(ts) ORDER BY fecha DESC LIMIT 60
  `).all();
  res.json({ ok: true, fechas: filas });
}));

export default router;
