/**
 * services/api.js — cliente HTTP de la API de SmartEgg.
 *
 * En desarrollo Vite redirige /api al backend (ver vite.config.js), así que la
 * URL base queda vacía y funciona igual desde la laptop o desde el celular.
 */

const BASE = import.meta.env.VITE_API_URL ?? '';

/** Error enriquecido: conserva los detalles de validación que manda el backend. */
export class ErrorApi extends Error {
  constructor(mensaje, estado, detalles) {
    super(mensaje);
    this.estado = estado;
    this.detalles = detalles ?? [];
  }

  /** Convierte los detalles en un objeto { campo: mensaje } para los formularios. */
  porCampo() {
    const salida = {};
    for (const d of this.detalles) {
      if (d.campo && !salida[d.campo]) salida[d.campo] = d.mensaje;
    }
    return salida;
  }
}

async function peticion(ruta, opciones = {}) {
  let respuesta;

  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      headers: { 'Content-Type': 'application/json', ...(opciones.headers ?? {}) },
      ...opciones,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
  } catch {
    throw new ErrorApi('No se pudo contactar al servidor. ¿Está corriendo el backend?', 0);
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    // respuesta sin cuerpo JSON
  }

  if (!respuesta.ok) {
    throw new ErrorApi(
      datos?.error ?? `Error ${respuesta.status}`,
      respuesta.status,
      datos?.detalles
    );
  }

  return datos;
}

const get = (ruta) => peticion(ruta);
const post = (ruta, body) => peticion(ruta, { method: 'POST', body });
const put = (ruta, body) => peticion(ruta, { method: 'PUT', body });
const patch = (ruta, body) => peticion(ruta, { method: 'PATCH', body });
const del = (ruta) => peticion(ruta, { method: 'DELETE' });

const qs = (params) => {
  const limpio = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return limpio.length ? `?${new URLSearchParams(limpio)}` : '';
};

export const api = {
  salud: () => get('/api/health'),

  auth: {
    login: (usuario, pin) => post('/api/auth/login', { usuario, pin }),
    tecnicos: () => get('/api/auth/tecnicos'),
    crearTecnico: (datos) => post('/api/auth/tecnicos', datos),
  },

  estado: {
    actual: () => get('/api/estado'),
    sensores: () => get('/api/estado/sensores'),
    puertos: () => get('/api/estado/puertos'),
  },

  lecturas: {
    listar: (params) => get(`/api/lecturas${qs(params)}`),
    serie: (minutos = 60) => get(`/api/lecturas/serie?minutos=${minutos}`),
    resumen: (fecha) => get(`/api/lecturas/resumen${qs({ fecha })}`),
    limpiar: () => del('/api/lecturas'),
  },

  lotes: {
    listar: (params) => get(`/api/lotes${qs(params)}`),
    obtener: (id) => get(`/api/lotes/${id}`),
    crear: (datos) => post('/api/lotes', datos),
    actualizar: (id, datos) => put(`/api/lotes/${id}`, datos),
    eliminar: (id) => del(`/api/lotes/${id}`),
  },

  huevos: {
    listar: (params) => get(`/api/huevos${qs(params)}`),
    posiciones: () => get('/api/huevos/posiciones'),
    obtener: (id) => get(`/api/huevos/${id}`),
    crear: (datos) => post('/api/huevos', datos),
    actualizar: (id, datos) => put(`/api/huevos/${id}`, datos),
    eliminar: (id) => del(`/api/huevos/${id}`),
  },

  alarmas: {
    listar: (params) => get(`/api/alarmas${qs(params)}`),
    activas: () => get('/api/alarmas/activas'),
    resumen: (fecha) => get(`/api/alarmas/resumen${qs({ fecha })}`),
    resolver: (id) => patch(`/api/alarmas/${id}/resolver`),
    eventos: (params) => get(`/api/alarmas/eventos${qs(params)}`),
  },

  control: {
    comando: (comando) => post('/api/control/comando', { comando }),
    sistemaEncender: () => post('/api/control/sistema/encender'),
    sistemaApagar: () => post('/api/control/sistema/apagar'),
    calefaccion: (accion) => post(`/api/control/calefaccion/${accion}`),
    ventilador: (accion) => post(`/api/control/ventilador/${accion}`),
    rotarAhora: () => post('/api/control/rotacion/ahora'),
    silenciarAlarma: () => post('/api/control/alarma/silenciar'),
    umbrales: () => get('/api/control/umbrales'),
    guardarUmbrales: (datos) => put('/api/control/umbrales', datos),
    simPuerta: () => post('/api/control/simulador/puerta'),
    simSensor: () => post('/api/control/simulador/sensor'),
    simEspacio: (n) => post(`/api/control/simulador/espacio/${n}`),
  },

  reportes: {
    diario: (fecha, tecnicoId) => get(`/api/reportes/diario${qs({ fecha, tecnico_id: tecnicoId })}`),
    fechas: () => get('/api/reportes/fechas'),
  },
};

export default api;
