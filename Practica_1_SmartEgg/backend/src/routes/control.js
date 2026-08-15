/**
 * routes/control.js — comandos hacia el Arduino y configuración de umbrales.
 */

import { Router } from 'express';
import { enviarComando, obtenerSimulador } from '../serial/puerto.js';
import { leerUmbrales, guardarUmbral, registrarEvento } from '../db/index.js';
import { config } from '../config.js';
import { validar } from '../validacion.js';
import { ErrorHttp, asyncHandler } from '../middleware/errores.js';

const router = Router();

/**
 * POST /api/control/comando   { comando: "SYS:ON" }
 * Envía un comando crudo al firmware.
 */
router.post('/comando', asyncHandler((req, res) => {
  const d = validar(req.body, {
    comando: { tipo: 'texto', requerido: true, min: 3, max: 30 },
  });

  const r = enviarComando(d.comando);
  if (!r.ok) throw new ErrorHttp(400, r.error);

  res.json({ ok: true, comando: d.comando.toUpperCase() });
}));

// --- Atajos legibles para el frontend -------------------------------------

const ATAJOS = {
  'sistema/encender': 'SYS:ON',
  'sistema/apagar': 'SYS:OFF',
  'calefaccion/encender': 'CAL:ON',
  'calefaccion/apagar': 'CAL:OFF',
  'calefaccion/auto': 'CAL:AUTO',
  'ventilador/encender': 'VEN:ON',
  'ventilador/apagar': 'VEN:OFF',
  'ventilador/auto': 'VEN:AUTO',
  'rotacion/ahora': 'ROT:NOW',
  'alarma/silenciar': 'ALM:RESET',
};

for (const [ruta, comando] of Object.entries(ATAJOS)) {
  router.post(`/${ruta}`, asyncHandler((req, res) => {
    const r = enviarComando(comando);
    if (!r.ok) throw new ErrorHttp(503, r.error);
    res.json({ ok: true, comando });
  }));
}

// --- Umbrales --------------------------------------------------------------

/** GET /api/control/umbrales */
router.get('/umbrales', asyncHandler((req, res) => {
  res.json({ ok: true, umbrales: leerUmbrales() });
}));

/**
 * PUT /api/control/umbrales
 * Guarda en la BD y los propaga al firmware con comandos SET:.
 */
router.put('/umbrales', asyncHandler((req, res) => {
  const d = validar(req.body, {
    temp_min: { tipo: 'numero', requerido: true, min: 20, max: 45 },
    temp_max: { tipo: 'numero', requerido: true, min: 20, max: 45 },
    temp_critica: { tipo: 'numero', requerido: true, min: 20, max: 60 },
    hum_min: { tipo: 'numero', requerido: true, min: 10, max: 95 },
    hum_max: { tipo: 'numero', requerido: true, min: 10, max: 95 },
  });

  const errores = [];
  if (d.temp_min >= d.temp_max) {
    errores.push({ campo: 'temp_min', mensaje: 'La mínima debe ser menor que la máxima' });
  }
  if (d.temp_critica <= d.temp_max) {
    errores.push({ campo: 'temp_critica', mensaje: 'La crítica debe ser mayor que la máxima' });
  }
  if (d.hum_min >= d.hum_max) {
    errores.push({ campo: 'hum_min', mensaje: 'La mínima debe ser menor que la máxima' });
  }
  if (errores.length) throw new ErrorHttp(400, 'Los umbrales no son coherentes', errores);

  for (const [clave, valor] of Object.entries(d)) guardarUmbral(clave, valor);

  const mapa = {
    temp_min: 'TMIN', temp_max: 'TMAX', temp_critica: 'TCRIT',
    hum_min: 'HMIN', hum_max: 'HMAX',
  };
  const fallidos = [];
  for (const [clave, sigla] of Object.entries(mapa)) {
    const r = enviarComando(`SET:${sigla}=${d[clave]}`);
    if (!r.ok) fallidos.push(sigla);
  }

  registrarEvento('configuracion', `Umbrales actualizados desde la aplicación web`);

  res.json({
    ok: true,
    umbrales: leerUmbrales(),
    // Si el Arduino no estaba conectado, los umbrales quedan guardados en la BD
    // y se reenvían cuando vuelva a conectarse.
    advertencia: fallidos.length
      ? 'Guardados en la base de datos, pero no se pudieron enviar al Arduino'
      : undefined,
  });
}));

// --- Utilidades del simulador (sólo activas en modo simulación) -------------

function exigirSimulador() {
  const sim = obtenerSimulador();
  if (!config.simular || !sim) {
    throw new ErrorHttp(409, 'Estas acciones sólo están disponibles en modo simulación');
  }
  return sim;
}

router.post('/simulador/puerta', asyncHandler((req, res) => {
  const abierta = exigirSimulador().alternarPuerta();
  res.json({ ok: true, puertaAbierta: abierta });
}));

router.post('/simulador/sensor', asyncHandler((req, res) => {
  const activo = exigirSimulador().alternarSensor();
  res.json({ ok: true, sensorOk: activo });
}));

router.post('/simulador/espacio/:n', asyncHandler((req, res) => {
  const r = exigirSimulador().alternarEspacio(req.params.n);
  if (r === null) throw new ErrorHttp(400, `Espacio inválido: ${req.params.n}`);
  res.json({ ok: true, posicion: Number(req.params.n), ocupado: r });
}));

export default router;
