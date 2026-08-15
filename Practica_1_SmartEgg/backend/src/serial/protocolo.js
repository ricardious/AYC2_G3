/**
 * serial/protocolo.js — traducción del protocolo del Arduino.
 *
 * El firmware envía una línea JSON por segundo. Este módulo la interpreta y la
 * convierte en un objeto con nombres legibles para el resto del backend.
 */

/** Catálogo de alarmas: el firmware sólo manda el número. */
export const ALARMAS = {
  0: { tipo: 'ninguna', severidad: 'baja', mensaje: 'Sin alarmas' },
  1: {
    tipo: 'sobrecalentamiento',
    severidad: 'critica',
    mensaje: 'Temperatura por encima del límite crítico',
  },
  2: {
    tipo: 'temperatura_baja',
    severidad: 'alta',
    mensaje: 'Temperatura muy por debajo del rango de incubación',
  },
  3: {
    tipo: 'humedad_fuera_rango',
    severidad: 'media',
    mensaje: 'Humedad fuera del rango 50–65 %',
  },
  4: {
    tipo: 'puerta_abierta',
    severidad: 'alta',
    mensaje: 'Puerta de la incubadora abierta',
  },
  5: {
    tipo: 'fallo_sensor',
    severidad: 'critica',
    mensaje: 'El sensor DHT22 dejó de responder',
  },
};

export function describirAlarma(codigo) {
  return ALARMAS[codigo] ?? {
    tipo: 'desconocida',
    severidad: 'media',
    mensaje: `Alarma no catalogada (código ${codigo})`,
  };
}

/** Descripciones legibles de los eventos puntuales del firmware. */
const EVENTOS = {
  boot: (v) => `Arduino reiniciado (firmware ${v})`,
  ram: (v) => `Memoria SRAM libre al arrancar: ${v} bytes`,
  rotacion: (v) => `Rotación de bandeja ejecutada (total: ${v})`,
  puerta: (v) => (v ? 'Puerta abierta' : 'Puerta cerrada'),
  boton: (v) => (v ? 'Sistema activado desde el botón físico' : 'Sistema apagado desde el botón físico'),
  alarma: (v) => `Cambio de alarma: ${describirAlarma(v).mensaje}`,
  error: (v) => `Error del firmware: ${v}`,
};

export function describirEvento(tipo, valor) {
  const fn = EVENTOS[tipo];
  return fn ? fn(valor) : `Evento ${tipo} (${valor})`;
}

/**
 * Convierte la trama compacta del firmware en un objeto con nombres completos.
 */
export function normalizarTelemetria(t) {
  return {
    temperatura: Number(t.t ?? 0),
    humedad: Number(t.h ?? 0),
    sensorOk: t.ok === 1,
    calefaccion: t.cal === 1,
    ventilador: t.ven === 1,
    buzzer: t.buz === 1,
    anguloServo: Number(t.ang ?? 90),
    espacios: Array.isArray(t.esp) ? t.esp.map((v) => v === 1) : [],
    espaciosOcupados: Number(t.ocu ?? 0),
    espaciosLibres: Number(t.lib ?? 0),
    sistemaActivo: t.sis === 1,
    puertaAbierta: t.pue === 1,
    alarma: Number(t.alm ?? 0),
    rotaciones: Number(t.rot ?? 0),
    umbrales: {
      tempMin: Number(t.tmin ?? 37),
      tempMax: Number(t.tmax ?? 38),
      humMin: Number(t.hmin ?? 50),
      humMax: Number(t.hmax ?? 65),
    },
    uptimeMs: Number(t.ms ?? 0),
  };
}

/**
 * Analiza una línea recibida por el puerto serie.
 * Devuelve { clase, ...datos } o null si la línea no es interpretable.
 */
export function parsearLinea(linea) {
  const texto = String(linea).trim();
  if (!texto) return null;

  // Sólo nos interesan las líneas JSON. Cualquier otra cosa (por ejemplo el
  // formato del Serial Plotter) se ignora en silencio.
  if (!texto.startsWith('{')) {
    return { clase: 'texto', texto };
  }

  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    return { clase: 'invalida', texto };
  }

  if (json.ev !== undefined) {
    return {
      clase: 'evento',
      tipo: String(json.ev),
      valor: json.v ?? json.fw ?? json.msg ?? null,
      crudo: json,
    };
  }

  if (json.ack !== undefined) {
    return { clase: 'ack', comando: json.ack, ok: json.ok === 1 };
  }

  if (json.t !== undefined) {
    return { clase: 'telemetria', datos: normalizarTelemetria(json) };
  }

  return { clase: 'desconocida', crudo: json };
}

/** Comandos válidos que el backend puede enviar al firmware. */
export const COMANDOS_VALIDOS = [
  /^SYS:(ON|OFF|TOGGLE)$/,
  /^CAL:(ON|OFF|AUTO)$/,
  /^VEN:(ON|OFF|AUTO)$/,
  /^ROT:NOW$/,
  /^ALM:RESET$/,
  /^MODE:(JSON|PLOT)$/,
  /^PING$/,
  /^SET:(TMIN|TMAX|TCRIT|HMIN|HMAX)=-?\d+(\.\d+)?$/,
];

export function comandoEsValido(comando) {
  const c = String(comando).trim().toUpperCase();
  return COMANDOS_VALIDOS.some((re) => re.test(c));
}
