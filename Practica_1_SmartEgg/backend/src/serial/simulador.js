/**
 * serial/simulador.js — incubadora virtual.
 *
 * Reproduce el mismo protocolo y la misma lógica de control que el firmware,
 * pero sin hardware. Sirve para:
 *   · desarrollar el frontend antes de que el prototipo esté armado,
 *   · probar la API y la base de datos,
 *   · enseñar el sistema si el Arduino no está a la mano.
 *
 * Se activa con `npm run sim` o con SIMULAR=1 en el .env.
 */

import { EventEmitter } from 'node:events';

const AMBIENTE = 24.0;          // temperatura del cuarto
const PERIODO_MS = 1000;
const ROTACION_MS = 120000;

export class Simulador extends EventEmitter {
  constructor() {
    super();
    this.timer = null;

    this.estado = {
      temperatura: AMBIENTE,
      humedad: 45.0,
      sensorOk: true,
      calefaccion: false,
      ventilador: false,
      buzzer: false,
      anguloServo: 90,
      espacios: [true, true, false, true],
      sistemaActivo: true,
      puertaAbierta: false,
      alarma: 0,
      rotaciones: 0,
      modoCalefaccion: 'auto',
      modoVentilador: 'auto',
      tempMin: 37.0,
      tempMax: 38.0,
      tempCritica: 39.5,
      humMin: 50.0,
      humMax: 65.0,
    };

    this.msDesdeRotacion = 0;
    this.inicio = Date.now();
    this.tonoBuzzer = false;
  }

  iniciar() {
    if (this.timer) return;
    this.emit('linea', JSON.stringify({ ev: 'boot', fw: '1.0.0-sim', board: 'SIMULADOR', slots: 4 }));
    this.timer = setInterval(() => this.tick(), PERIODO_MS);
  }

  detener() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // -------------------------------------------------------------------------
  //  Modelo físico simplificado
  // -------------------------------------------------------------------------
  simularFisica() {
    const e = this.estado;
    const dt = PERIODO_MS / 1000;

    // Pérdida pasiva hacia la temperatura ambiente
    let delta = (AMBIENTE - e.temperatura) * 0.012 * dt;

    if (e.calefaccion) delta += 0.28 * dt;   // la bombilla calienta
    if (e.ventilador) delta -= 0.20 * dt;    // el ventilador enfría
    if (e.puertaAbierta) delta -= 0.35 * dt; // se escapa el calor

    e.temperatura += delta + (Math.random() - 0.5) * 0.04;

    // La humedad sube con el calor y baja con el ventilador
    let dh = (Math.random() - 0.5) * 0.3;
    if (e.calefaccion) dh += 0.18;
    if (e.ventilador) dh -= 0.42;
    if (e.puertaAbierta) dh -= 0.6;
    e.humedad = Math.min(95, Math.max(20, e.humedad + dh));

    e.temperatura = Math.round(e.temperatura * 10) / 10;
    e.humedad = Math.round(e.humedad * 10) / 10;
  }

  // -------------------------------------------------------------------------
  //  Misma lógica de control que TareaControl del firmware
  // -------------------------------------------------------------------------
  simularControl() {
    const e = this.estado;

    if (!e.sistemaActivo) {
      e.calefaccion = false;
      e.ventilador = false;
      e.buzzer = false;
      e.alarma = 0;
      return;
    }

    if (e.modoCalefaccion === 'auto') {
      if (e.temperatura < e.tempMin) e.calefaccion = true;
      else if (e.temperatura >= e.tempMin + 0.3) e.calefaccion = false;
      if (e.temperatura >= e.tempCritica) e.calefaccion = false;
    } else {
      e.calefaccion = e.modoCalefaccion === 'on';
    }

    if (e.modoVentilador === 'auto') {
      if (e.temperatura > e.tempMax || e.humedad > e.humMax) e.ventilador = true;
      else if (e.temperatura <= e.tempMax - 0.3 && e.humedad <= e.humMax - 2) e.ventilador = false;
    } else {
      e.ventilador = e.modoVentilador === 'on';
    }

    // Alarmas, de mayor a menor gravedad
    if (!e.sensorOk) e.alarma = 5;
    else if (e.temperatura >= e.tempCritica) e.alarma = 1;
    else if (e.puertaAbierta) e.alarma = 4;
    else if (e.humedad < e.humMin || e.humedad > e.humMax) e.alarma = 3;
    else if (e.temperatura < e.tempMin - 2.0) e.alarma = 2;
    else e.alarma = 0;

    this.tonoBuzzer = e.alarma !== 0 ? !this.tonoBuzzer : false;
    e.buzzer = this.tonoBuzzer;
  }

  simularRotacion() {
    if (!this.estado.sistemaActivo) return;
    this.msDesdeRotacion += PERIODO_MS;
    if (this.msDesdeRotacion >= ROTACION_MS) {
      this.rotar();
    }
  }

  rotar() {
    this.msDesdeRotacion = 0;
    this.estado.rotaciones++;
    this.estado.anguloServo = 135;
    setTimeout(() => { this.estado.anguloServo = 45; }, 400);
    setTimeout(() => { this.estado.anguloServo = 90; }, 900);
    this.emit('linea', JSON.stringify({ ev: 'rotacion', v: this.estado.rotaciones }));
  }

  tick() {
    this.simularFisica();
    this.simularControl();
    this.simularRotacion();
    this.emit('linea', this.tramaJson());
  }

  tramaJson() {
    const e = this.estado;
    const ocupados = e.espacios.filter(Boolean).length;
    return JSON.stringify({
      t: e.temperatura,
      h: e.humedad,
      ok: e.sensorOk ? 1 : 0,
      cal: e.calefaccion ? 1 : 0,
      ven: e.ventilador ? 1 : 0,
      buz: e.buzzer ? 1 : 0,
      ang: e.anguloServo,
      esp: e.espacios.map((v) => (v ? 1 : 0)),
      ocu: ocupados,
      lib: e.espacios.length - ocupados,
      sis: e.sistemaActivo ? 1 : 0,
      pue: e.puertaAbierta ? 1 : 0,
      alm: e.alarma,
      rot: e.rotaciones,
      tmin: e.tempMin,
      tmax: e.tempMax,
      hmin: e.humMin,
      hmax: e.humMax,
      ms: Date.now() - this.inicio,
    });
  }

  // -------------------------------------------------------------------------
  //  Comandos (mismo repertorio que el firmware)
  // -------------------------------------------------------------------------
  enviarComando(comando) {
    const cmd = String(comando).trim().toUpperCase();
    const e = this.estado;
    let ok = true;

    switch (cmd) {
      case 'SYS:ON': e.sistemaActivo = true; break;
      case 'SYS:OFF': e.sistemaActivo = false; break;
      case 'SYS:TOGGLE': e.sistemaActivo = !e.sistemaActivo; break;
      case 'CAL:ON': e.modoCalefaccion = 'on'; break;
      case 'CAL:OFF': e.modoCalefaccion = 'off'; break;
      case 'CAL:AUTO': e.modoCalefaccion = 'auto'; break;
      case 'VEN:ON': e.modoVentilador = 'on'; break;
      case 'VEN:OFF': e.modoVentilador = 'off'; break;
      case 'VEN:AUTO': e.modoVentilador = 'auto'; break;
      case 'ROT:NOW': this.rotar(); break;
      case 'ALM:RESET': e.alarma = 0; break;
      case 'PING': break;
      case 'MODE:JSON':
      case 'MODE:PLOT': break;
      default: {
        const m = cmd.match(/^SET:(TMIN|TMAX|TCRIT|HMIN|HMAX)=(-?\d+(?:\.\d+)?)$/);
        if (m) {
          const claves = { TMIN: 'tempMin', TMAX: 'tempMax', TCRIT: 'tempCritica', HMIN: 'humMin', HMAX: 'humMax' };
          e[claves[m[1]]] = Number(m[2]);
        } else {
          ok = false;
        }
      }
    }

    this.emit('linea', JSON.stringify({ ack: cmd, ok: ok ? 1 : 0 }));
    return ok;
  }

  // -------------------------------------------------------------------------
  //  Utilidades sólo del simulador (para la demo)
  // -------------------------------------------------------------------------

  /** Abre o cierra la puerta virtual. */
  alternarPuerta() {
    this.estado.puertaAbierta = !this.estado.puertaAbierta;
    this.emit('linea', JSON.stringify({ ev: 'puerta', v: this.estado.puertaAbierta ? 1 : 0 }));
    return this.estado.puertaAbierta;
  }

  /** Ocupa o libera un espacio de huevo virtual (1..4). */
  alternarEspacio(n) {
    const i = Number(n) - 1;
    if (i < 0 || i >= this.estado.espacios.length) return null;
    this.estado.espacios[i] = !this.estado.espacios[i];
    return this.estado.espacios[i];
  }

  /** Simula la caída del sensor DHT22. */
  alternarSensor() {
    this.estado.sensorOk = !this.estado.sensorOk;
    return this.estado.sensorOk;
  }
}
