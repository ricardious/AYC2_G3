/**
 * routes/huevos.js — ficha de identificación del huevo rotulado.
 *
 * La incubadora tiene 4 posiciones físicas. Un huevo "incubando" ocupa una
 * posición y no puede haber dos en la misma (índice único parcial en la BD).
 */

import { Router } from 'express';
import { db, registrarEvento } from '../db/index.js';
import { config, ahora, hoy } from '../config.js';
import { estado } from '../estado.js';
import { validar } from '../validacion.js';
import { ErrorHttp, asyncHandler } from '../middleware/errores.js';

const router = Router();

const ESQUEMA = {
  lote_id: { tipo: 'entero', requerido: true, min: 1 },
  codigo: {
    tipo: 'texto', requerido: true, min: 2, max: 30,
    patron: /^[A-Za-z0-9-]+$/,
    mensajePatron: 'Sólo letras, números y guiones (ej. H-001)',
  },
  posicion: { tipo: 'entero', requerido: true, min: 1, max: config.totalEspacios },
  peso_gramos: { tipo: 'numero', requerido: false, min: 20, max: 120 },
  fecha_ingreso: { tipo: 'fecha', requerido: true },
  estado: {
    tipo: 'opcion', requerido: false,
    opciones: ['incubando', 'eclosionado', 'descartado'], defecto: 'incubando',
  },
  observaciones: { tipo: 'texto', requerido: false, max: 400 },
  registrado_por: { tipo: 'entero', requerido: false, min: 1 },
};

const SELECT_COMPLETO = `
  SELECT h.*, l.codigo AS lote_codigo, l.especie, l.dias_incubacion,
         t.nombre AS tecnico_nombre
  FROM huevos h
  JOIN lotes l ON l.id = h.lote_id
  LEFT JOIN tecnicos t ON t.id = h.registrado_por
`;

/** GET /api/huevos?lote_id=1&estado=incubando */
router.get('/', asyncHandler((req, res) => {
  const filtros = [];
  const params = [];

  if (req.query.lote_id) { filtros.push('h.lote_id = ?'); params.push(Number(req.query.lote_id)); }
  if (req.query.estado) { filtros.push('h.estado = ?'); params.push(String(req.query.estado)); }

  const sql = SELECT_COMPLETO
    + (filtros.length ? ` WHERE ${filtros.join(' AND ')}` : '')
    + ' ORDER BY h.posicion, h.codigo';

  const filas = db.prepare(sql).all(...params);
  res.json({ ok: true, total: filas.length, huevos: filas });
}));

/**
 * GET /api/huevos/posiciones
 * Cruza lo que dice la base de datos con lo que reportan los sensores físicos.
 * Es la vista que pidieron los agrónomos: cuántos espacios hay disponibles.
 */
router.get('/posiciones', asyncHandler((req, res) => {
  const registrados = db.prepare(
    `SELECT h.*, l.codigo AS lote_codigo FROM huevos h
     JOIN lotes l ON l.id = h.lote_id
     WHERE h.estado = 'incubando'`
  ).all();

  const posiciones = [];
  for (let i = 1; i <= config.totalEspacios; i++) {
    const huevo = registrados.find((h) => h.posicion === i) ?? null;
    const sensorOcupado = estado.espacios[i - 1] ?? false;

    posiciones.push({
      posicion: i,
      pin: `A${i - 1}`,
      registrado: huevo,
      sensorOcupado,
      // Si la BD dice que hay huevo pero el sensor no lo ve (o al revés),
      // se marca la discrepancia para que el técnico la revise.
      discrepancia: Boolean(huevo) !== sensorOcupado,
    });
  }

  res.json({
    ok: true,
    totalEspacios: config.totalEspacios,
    ocupadosSensor: estado.espaciosOcupados,
    libresSensor: estado.espaciosLibres,
    ocupadosRegistro: registrados.length,
    libresRegistro: config.totalEspacios - registrados.length,
    posiciones,
  });
}));

/** GET /api/huevos/:id */
router.get('/:id', asyncHandler((req, res) => {
  const huevo = db.prepare(`${SELECT_COMPLETO} WHERE h.id = ?`).get(req.params.id);
  if (!huevo) throw new ErrorHttp(404, 'Huevo no encontrado');
  res.json({ ok: true, huevo });
}));

/** POST /api/huevos — formulario de registro */
router.post('/', asyncHandler((req, res) => {
  const d = validar(req.body, ESQUEMA);

  const lote = db.prepare('SELECT * FROM lotes WHERE id = ?').get(d.lote_id);
  if (!lote) {
    throw new ErrorHttp(400, 'El lote indicado no existe', [
      { campo: 'lote_id', mensaje: 'Seleccione un lote válido' },
    ]);
  }

  if (db.prepare('SELECT 1 FROM huevos WHERE codigo = ?').get(d.codigo)) {
    throw new ErrorHttp(409, `Ya existe un huevo rotulado como ${d.codigo}`, [
      { campo: 'codigo', mensaje: 'Este rótulo ya está en uso' },
    ]);
  }

  if (d.estado === 'incubando') {
    const ocupada = db.prepare(
      "SELECT codigo FROM huevos WHERE posicion = ? AND estado = 'incubando'"
    ).get(d.posicion);
    if (ocupada) {
      throw new ErrorHttp(409, `La posición ${d.posicion} ya está ocupada por ${ocupada.codigo}`, [
        { campo: 'posicion', mensaje: `Ocupada por el huevo ${ocupada.codigo}` },
      ]);
    }
  }

  if (d.fecha_ingreso > hoy()) {
    throw new ErrorHttp(400, 'La fecha de ingreso no puede ser futura', [
      { campo: 'fecha_ingreso', mensaje: 'No puede ser una fecha futura' },
    ]);
  }

  const info = db.prepare(`
    INSERT INTO huevos (lote_id, codigo, posicion, peso_gramos, fecha_ingreso,
                        estado, observaciones, registrado_por, creado_en)
    VALUES (@lote_id, @codigo, @posicion, @peso_gramos, @fecha_ingreso,
            @estado, @observaciones, @registrado_por, @creado_en)
  `).run({
    peso_gramos: null, observaciones: null, registrado_por: null,
    ...d,
    creado_en: ahora(),
  });

  registrarEvento('huevo', `Huevo ${d.codigo} registrado en la posición ${d.posicion} (lote ${lote.codigo})`);

  const huevo = db.prepare(`${SELECT_COMPLETO} WHERE h.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, huevo });
}));

/** PUT /api/huevos/:id */
router.put('/:id', asyncHandler((req, res) => {
  const actual = db.prepare('SELECT * FROM huevos WHERE id = ?').get(req.params.id);
  if (!actual) throw new ErrorHttp(404, 'Huevo no encontrado');

  const d = validar(req.body, ESQUEMA);

  if (db.prepare('SELECT 1 FROM huevos WHERE codigo = ? AND id != ?').get(d.codigo, actual.id)) {
    throw new ErrorHttp(409, 'Ese rótulo ya está en uso por otro huevo', [
      { campo: 'codigo', mensaje: 'Rótulo duplicado' },
    ]);
  }

  if (d.estado === 'incubando') {
    const ocupada = db.prepare(
      "SELECT codigo FROM huevos WHERE posicion = ? AND estado = 'incubando' AND id != ?"
    ).get(d.posicion, actual.id);
    if (ocupada) {
      throw new ErrorHttp(409, `La posición ${d.posicion} ya está ocupada por ${ocupada.codigo}`, [
        { campo: 'posicion', mensaje: `Ocupada por el huevo ${ocupada.codigo}` },
      ]);
    }
  }

  db.prepare(`
    UPDATE huevos SET lote_id=@lote_id, codigo=@codigo, posicion=@posicion,
      peso_gramos=@peso_gramos, fecha_ingreso=@fecha_ingreso, estado=@estado,
      observaciones=@observaciones, actualizado_en=@actualizado_en
    WHERE id=@id
  `).run({
    peso_gramos: null, observaciones: null,
    ...d,
    id: actual.id,
    actualizado_en: ahora(),
  });

  if (d.estado !== actual.estado) {
    registrarEvento('huevo', `Huevo ${d.codigo} cambió a estado "${d.estado}"`);
  }

  const huevo = db.prepare(`${SELECT_COMPLETO} WHERE h.id = ?`).get(actual.id);
  res.json({ ok: true, huevo });
}));

/** DELETE /api/huevos/:id */
router.delete('/:id', asyncHandler((req, res) => {
  const huevo = db.prepare('SELECT * FROM huevos WHERE id = ?').get(req.params.id);
  if (!huevo) throw new ErrorHttp(404, 'Huevo no encontrado');

  db.prepare('DELETE FROM huevos WHERE id = ?').run(huevo.id);
  registrarEvento('huevo', `Huevo ${huevo.codigo} eliminado del registro`);

  res.json({ ok: true, mensaje: `Huevo ${huevo.codigo} eliminado` });
}));

export default router;
