/**
 * routes/auth.js — autenticación simple del técnico.
 *
 * NOTA DE ALCANCE: es un prototipo de laboratorio. El PIN se guarda en claro y
 * no se emiten tokens firmados; el frontend guarda el técnico en localStorage.
 * Sirve para lo que pide la práctica (que el reporte PDF lleve los datos del
 * técnico autenticado) sin montar un sistema de sesiones completo.
 */

import { Router } from 'express';
import { db } from '../db/index.js';
import { ahora } from '../config.js';
import { validar } from '../validacion.js';
import { ErrorHttp, asyncHandler } from '../middleware/errores.js';

const router = Router();

/** POST /api/auth/login — { usuario, pin } */
router.post('/login', asyncHandler((req, res) => {
  const datos = validar(req.body, {
    usuario: { tipo: 'texto', requerido: true, min: 3, max: 40 },
    pin: { tipo: 'texto', requerido: true, min: 4, max: 10 },
  });

  const tecnico = db
    .prepare('SELECT * FROM tecnicos WHERE usuario = ? AND activo = 1')
    .get(datos.usuario.toLowerCase());

  if (!tecnico || tecnico.pin !== datos.pin) {
    throw new ErrorHttp(401, 'Usuario o PIN incorrectos');
  }

  const { pin, ...publico } = tecnico;
  res.json({ ok: true, tecnico: publico });
}));

/** GET /api/auth/tecnicos — listado (para el selector del login) */
router.get('/tecnicos', asyncHandler((req, res) => {
  const filas = db
    .prepare('SELECT id, nombre, usuario, carne, rol FROM tecnicos WHERE activo = 1 ORDER BY nombre')
    .all();
  res.json({ ok: true, tecnicos: filas });
}));

/** POST /api/auth/tecnicos — alta de un técnico */
router.post('/tecnicos', asyncHandler((req, res) => {
  const datos = validar(req.body, {
    nombre: { tipo: 'texto', requerido: true, min: 3, max: 80 },
    usuario: {
      tipo: 'texto',
      requerido: true,
      min: 3,
      max: 40,
      patron: /^[a-zA-Z0-9._-]+$/,
      mensajePatron: 'Sólo letras, números, punto, guion y guion bajo',
    },
    pin: { tipo: 'texto', requerido: true, min: 4, max: 10, patron: /^\d+$/, mensajePatron: 'El PIN debe ser numérico' },
    carne: { tipo: 'texto', requerido: false, max: 20 },
    rol: { tipo: 'opcion', requerido: false, opciones: ['tecnico', 'supervisor'], defecto: 'tecnico' },
  });

  const existe = db.prepare('SELECT 1 FROM tecnicos WHERE usuario = ?').get(datos.usuario.toLowerCase());
  if (existe) throw new ErrorHttp(409, 'Ese usuario ya está registrado');

  const info = db.prepare(
    `INSERT INTO tecnicos (nombre, usuario, pin, carne, rol, creado_en)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(datos.nombre, datos.usuario.toLowerCase(), datos.pin, datos.carne ?? null, datos.rol, ahora());

  res.status(201).json({ ok: true, id: info.lastInsertRowid });
}));

export default router;
