/**
 * estado.js — estado vivo de la incubadora.
 *
 * Es la única copia en memoria de "cómo está la incubadora ahora mismo".
 * El puente serial la alimenta, la API la consulta y los WebSockets la
 * difunden al frontend. También decide cuándo persistir en la base de datos.
 */

import { EventEmitter } from 'node:events';
import { db, registrarEvento } from './db/index.js';
import { config, ahora } from './config.js';
import { describirAlarma } from './serial/protocolo.js';

export const bus = new EventEmitter();

export const estado = {
  conectado: false,
  fuente: 'ninguna',          // 'serial' | 'simulador' | 'ninguna'
  puerto: null,
  ultimaActualizacion: null,

  temperatura: 0,
  humedad: 0,
  sensorOk: false,
  calefaccion: false,
  ventilador: false,
  buzzer: false,
  anguloServo: 90,
  espacios: Array(config.totalEspacios).fill(false),
  espaciosOcupados: 0,
  espaciosLibres: config.totalEspacios,
  sistemaActivo: false,
  puertaAbierta: false,
  alarma: 0,
  rotaciones: 0,
  umbrales: { tempMin: 37, tempMax: 38, humMin: 50, humMax: 65 },
  uptimeMs: 0,
};

let ultimoGuardado = 0;

// Anti-rebote de alarmas: cuando una variable oscila justo en el umbral (por
// ejemplo la humedad rondando el 65 %), la alarma se activa y desactiva cada
// pocos segundos. Sin esto la bitácora se llenaría de decenas de registros
// idénticos y el informe PDF sería ilegible.
const ALARMA_REPETIR_MS = 120_000;   // 2 minutos entre registros del mismo código
const ultimaVezRegistrada = new Map();   // código → timestamp

const insertarLectura = db.prepare(`
  INSERT INTO lecturas (
    ts, temperatura, humedad, sensor_ok, calefaccion, ventilador, buzzer,
    angulo_servo, espacios_ocupados, espacios_libres, sistema_activo,
    puerta_abierta, alarma, rotaciones
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertarAlarma = db.prepare(`
  INSERT INTO alarmas (ts, codigo, tipo, severidad, mensaje, temperatura, humedad)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const resolverAlarmasAbiertas = db.prepare(`
  UPDATE alarmas SET resuelta = 1, ts_resuelta = ? WHERE resuelta = 0
`);

/**
 * Aplica una trama de telemetría: actualiza el estado, detecta cambios de
 * alarma y guarda en la base de datos con la frecuencia configurada.
 */
export function aplicarTelemetria(datos, fuente = 'serial') {
  const alarmaAnterior = estado.alarma;

  Object.assign(estado, datos);
  estado.conectado = true;
  estado.fuente = fuente;
  estado.ultimaActualizacion = ahora();

  // --- Registro de alarmas (sólo en las transiciones) ---
  if (datos.alarma !== alarmaAnterior) {
    if (datos.alarma !== 0) {
      const info = describirAlarma(datos.alarma);
      const previa = ultimaVezRegistrada.get(datos.alarma) ?? 0;
      const repetida = Date.now() - previa < ALARMA_REPETIR_MS;

      if (!repetida) {
        ultimaVezRegistrada.set(datos.alarma, Date.now());
        insertarAlarma.run(
          ahora(),
          datos.alarma,
          info.tipo,
          info.severidad,
          info.mensaje,
          datos.temperatura,
          datos.humedad
        );
      }

      // El aviso en vivo sí se emite siempre: la interfaz debe reaccionar al
      // instante aunque no se guarde una fila nueva en la base de datos.
      bus.emit('alarma', {
        codigo: datos.alarma, ...info,
        ts: estado.ultimaActualizacion,
        registrada: !repetida,
      });
    } else {
      resolverAlarmasAbiertas.run(ahora());
      bus.emit('alarma-resuelta', { ts: estado.ultimaActualizacion });
    }
  }

  // --- Persistencia con throttling ---
  const t = Date.now();
  if (t - ultimoGuardado >= config.guardarCadaMs) {
    ultimoGuardado = t;
    insertarLectura.run(
      estado.ultimaActualizacion,
      datos.temperatura,
      datos.humedad,
      datos.sensorOk ? 1 : 0,
      datos.calefaccion ? 1 : 0,
      datos.ventilador ? 1 : 0,
      datos.buzzer ? 1 : 0,
      datos.anguloServo,
      datos.espaciosOcupados,
      datos.espaciosLibres,
      datos.sistemaActivo ? 1 : 0,
      datos.puertaAbierta ? 1 : 0,
      datos.alarma,
      datos.rotaciones
    );
  }

  bus.emit('telemetria', instantanea());
}

/** Marca la incubadora como desconectada. */
export function marcarDesconectado(motivo = 'sin datos') {
  if (estado.conectado) {
    registrarEvento('conexion', `Incubadora desconectada: ${motivo}`);
  }
  estado.conectado = false;
  estado.fuente = 'ninguna';
  bus.emit('telemetria', instantanea());
}

export function marcarConectado(puerto, fuente = 'serial') {
  estado.conectado = true;
  estado.puerto = puerto;
  estado.fuente = fuente;
  registrarEvento('conexion', `Incubadora conectada en ${puerto} (${fuente})`);
  bus.emit('telemetria', instantanea());
}

/** Copia serializable del estado actual, lista para enviar por HTTP o socket. */
export function instantanea() {
  return {
    ...estado,
    espacios: [...estado.espacios],
    umbrales: { ...estado.umbrales },
    alarmaInfo: describirAlarma(estado.alarma),
  };
}

/**
 * Lista de sensores con su estado, para la vista "qué sensores están activos"
 * que piden los ingenieros agrónomos.
 */
export function listarSensores() {
  const sensores = [
    {
      id: 'dht22',
      nombre: 'DHT22 — Temperatura',
      tipo: 'ambiental',
      pin: 'D4',
      activo: estado.conectado && estado.sensorOk,
      valor: estado.temperatura,
      unidad: '°C',
    },
    {
      id: 'dht22-hum',
      nombre: 'DHT22 — Humedad',
      tipo: 'ambiental',
      pin: 'D4',
      activo: estado.conectado && estado.sensorOk,
      valor: estado.humedad,
      unidad: '%',
    },
    {
      id: 'final-carrera',
      nombre: 'Final de carrera — Puerta',
      tipo: 'seguridad',
      pin: 'D3 (INT1)',
      activo: estado.conectado,
      valor: estado.puertaAbierta ? 'Abierta' : 'Cerrada',
      unidad: '',
    },
    {
      id: 'boton',
      nombre: 'Botón de encendido',
      tipo: 'entrada',
      pin: 'D2 (INT0)',
      activo: estado.conectado,
      valor: estado.sistemaActivo ? 'Sistema activo' : 'Sistema apagado',
      unidad: '',
    },
  ];

  for (let i = 0; i < config.totalEspacios; i++) {
    sensores.push({
      id: `espacio-${i + 1}`,
      nombre: `Espacio de huevo ${i + 1}`,
      tipo: 'presencia',
      pin: `A${i}`,
      activo: estado.conectado,
      valor: estado.espacios[i] ? 'Ocupado' : 'Libre',
      unidad: '',
    });
  }

  return sensores;
}

/** Estado de los actuadores, para la misma vista. */
export function listarActuadores() {
  return [
    {
      id: 'calefaccion',
      nombre: 'Fuente de calor (bombilla)',
      pin: 'D5 — Relé 1',
      encendido: estado.calefaccion,
    },
    {
      id: 'ventilador',
      nombre: 'Ventilador',
      pin: 'D6 — Relé 2',
      encendido: estado.ventilador,
    },
    {
      id: 'buzzer',
      nombre: 'Buzzer de alarma',
      pin: 'D7',
      encendido: estado.buzzer,
    },
    {
      id: 'servo',
      nombre: 'Servomotor de rotación',
      pin: 'D9',
      encendido: estado.anguloServo !== 90,
      detalle: `${estado.anguloServo}° · ${estado.rotaciones} rotaciones`,
    },
  ];
}
