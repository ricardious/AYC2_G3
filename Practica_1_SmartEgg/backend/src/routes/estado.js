/**
 * routes/estado.js — estado en vivo de la incubadora, sensores y actuadores.
 */

import { Router } from 'express';
import { instantanea, listarSensores, listarActuadores } from '../estado.js';
import { listarPuertos } from '../serial/puerto.js';
import { config } from '../config.js';
import { asyncHandler } from '../middleware/errores.js';

const router = Router();

/** GET /api/estado — foto completa del sistema */
router.get('/', (req, res) => {
  res.json({ ok: true, estado: instantanea() });
});

/** GET /api/estado/sensores — qué sensores están activos y qué reportan */
router.get('/sensores', (req, res) => {
  res.json({
    ok: true,
    sensores: listarSensores(),
    actuadores: listarActuadores(),
  });
});

/** GET /api/estado/puertos — puertos serie del equipo (diagnóstico) */
router.get('/puertos', asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    modoSimulacion: config.simular,
    puertoConfigurado: config.serial.puerto,
    puertos: await listarPuertos(),
  });
}));

export default router;
