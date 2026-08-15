/**
 * serial/puerto.js — puente entre el Arduino (UART/USB) y el backend.
 *
 * Responsabilidades:
 *   · detectar y abrir el puerto COM del Arduino,
 *   · reconectar solo si se desconecta el cable,
 *   · partir el flujo en líneas y entregarlas al protocolo,
 *   · enviar comandos hacia el firmware.
 *
 * Si config.simular está activo se usa la incubadora virtual en lugar del
 * puerto físico, manteniendo exactamente la misma interfaz.
 */

import { SerialPort, ReadlineParser } from 'serialport';
import { config } from '../config.js';
import { parsearLinea, describirEvento, comandoEsValido } from './protocolo.js';
import { aplicarTelemetria, marcarConectado, marcarDesconectado, bus } from '../estado.js';
import { registrarEvento } from '../db/index.js';
import { Simulador } from './simulador.js';

// Identificadores USB habituales de placas Arduino UNO y clones
const VENDORS_ARDUINO = ['2341', '2a03', '1a86', '0403', '10c4'];

let puerto = null;
let simulador = null;
let temporizadorReconexion = null;
let vigilanteDatos = null;
let ultimoDato = 0;

/** Lista los puertos serie disponibles con una marca de "parece Arduino". */
export async function listarPuertos() {
  const puertos = await SerialPort.list();
  return puertos.map((p) => ({
    path: p.path,
    fabricante: p.manufacturer ?? null,
    numeroSerie: p.serialNumber ?? null,
    vendorId: p.vendorId ?? null,
    productId: p.productId ?? null,
    pareceArduino: esArduino(p),
  }));
}

function esArduino(p) {
  const vid = (p.vendorId ?? '').toLowerCase();
  const fab = (p.manufacturer ?? '').toLowerCase();
  return VENDORS_ARDUINO.includes(vid) || fab.includes('arduino') || fab.includes('wch') || fab.includes('ftdi');
}

async function detectarPuerto() {
  if (config.serial.puerto && config.serial.puerto !== 'AUTO') {
    return config.serial.puerto;
  }
  const puertos = await SerialPort.list();
  const candidato = puertos.find(esArduino) ?? puertos[0];
  return candidato?.path ?? null;
}

// ---------------------------------------------------------------------------
//  Procesamiento de cada línea recibida
// ---------------------------------------------------------------------------
function procesarLinea(linea) {
  ultimoDato = Date.now();
  const r = parsearLinea(linea);
  if (!r) return;

  switch (r.clase) {
    case 'telemetria':
      aplicarTelemetria(r.datos, config.simular ? 'simulador' : 'serial');
      break;

    case 'evento': {
      const descripcion = describirEvento(r.tipo, r.valor);
      registrarEvento(r.tipo, descripcion, Number.isFinite(Number(r.valor)) ? Number(r.valor) : null);
      bus.emit('evento', { tipo: r.tipo, descripcion, valor: r.valor });
      break;
    }

    case 'ack':
      bus.emit('ack', { comando: r.comando, ok: r.ok });
      break;

    default:
      break;   // texto suelto o líneas del Serial Plotter: se ignoran
  }
}

// ---------------------------------------------------------------------------
//  Conexión real
// ---------------------------------------------------------------------------
async function abrirPuertoReal() {
  const ruta = await detectarPuerto();

  if (!ruta) {
    console.log('⚠️  No se encontró ningún puerto serie. Reintentando...');
    programarReconexion();
    return;
  }

  puerto = new SerialPort(
    { path: ruta, baudRate: config.serial.baudios, autoOpen: false },
    (err) => { if (err) console.error('Error creando el puerto:', err.message); }
  );

  const parser = puerto.pipe(new ReadlineParser({ delimiter: '\n' }));
  parser.on('data', procesarLinea);

  puerto.on('open', () => {
    console.log(`🔌 Arduino conectado en ${ruta} @ ${config.serial.baudios} baudios`);
    ultimoDato = Date.now();
    marcarConectado(ruta, 'serial');
    // El UNO se reinicia al abrir el puerto: hay que esperar al bootloader
    setTimeout(() => enviarComando('MODE:JSON'), 2500);
  });

  puerto.on('error', (err) => {
    console.error('⚠️  Error del puerto serie:', err.message);
  });

  puerto.on('close', () => {
    console.log('🔌 Puerto serie cerrado');
    marcarDesconectado('puerto cerrado');
    puerto = null;
    programarReconexion();
  });

  puerto.open((err) => {
    if (err) {
      console.log(`⚠️  No se pudo abrir ${ruta}: ${err.message}`);
      puerto = null;
      programarReconexion();
    }
  });
}

function programarReconexion() {
  if (temporizadorReconexion) return;
  temporizadorReconexion = setTimeout(() => {
    temporizadorReconexion = null;
    abrirPuertoReal();
  }, config.serial.reintentoMs);
}

// ---------------------------------------------------------------------------
//  API pública del módulo
// ---------------------------------------------------------------------------

export async function iniciarPuente() {
  if (config.simular) {
    simulador = new Simulador();
    simulador.on('linea', procesarLinea);
    simulador.iniciar();
    marcarConectado('SIMULADOR', 'simulador');
    console.log('🧪 Modo simulación activo: no se requiere Arduino');
  } else {
    await abrirPuertoReal();
  }

  // Vigilante: si pasan más de 8 s sin tramas, se marca como desconectado
  vigilanteDatos = setInterval(() => {
    if (ultimoDato && Date.now() - ultimoDato > 8000) {
      marcarDesconectado('sin tramas por más de 8 s');
      ultimoDato = 0;
    }
  }, 4000);
}

export function detenerPuente() {
  if (vigilanteDatos) clearInterval(vigilanteDatos);
  if (temporizadorReconexion) clearTimeout(temporizadorReconexion);
  if (simulador) simulador.detener();
  if (puerto?.isOpen) puerto.close();
}

/**
 * Envía un comando al firmware. Devuelve { ok, error } sin lanzar excepciones,
 * para que las rutas HTTP puedan responder con un código adecuado.
 */
export function enviarComando(comando) {
  const cmd = String(comando).trim().toUpperCase();

  if (!comandoEsValido(cmd)) {
    return { ok: false, error: `Comando no reconocido: ${cmd}` };
  }

  if (config.simular) {
    if (!simulador) return { ok: false, error: 'Simulador no iniciado' };
    simulador.enviarComando(cmd);
    registrarEvento('comando', `Comando enviado al simulador: ${cmd}`);
    return { ok: true };
  }

  if (!puerto?.isOpen) {
    return { ok: false, error: 'El Arduino no está conectado' };
  }

  puerto.write(`${cmd}\n`, (err) => {
    if (err) console.error('Error enviando comando:', err.message);
  });
  registrarEvento('comando', `Comando enviado al Arduino: ${cmd}`);
  return { ok: true };
}

/** Acceso al simulador para las rutas de demostración. */
export function obtenerSimulador() {
  return simulador;
}
