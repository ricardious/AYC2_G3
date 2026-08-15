/**
 * realtime/socket.js — difusión en tiempo real hacia el frontend.
 *
 * Eventos que emite el servidor:
 *   telemetria       → estado completo, ~1 vez por segundo
 *   alarma           → cuando se dispara una alarma nueva
 *   alarma-resuelta  → cuando la condición desaparece
 *   evento           → rotación, puerta, botón físico, etc.
 *   ack              → confirmación de un comando enviado al Arduino
 */

import { Server } from 'socket.io';
import { bus, instantanea } from '../estado.js';
import { config } from '../config.js';

export function iniciarSocket(servidorHttp) {
  const io = new Server(servidorHttp, {
    cors: { origin: config.corsOrigen, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    console.log(`🌐 Cliente conectado (${socket.id}) · total: ${io.engine.clientsCount}`);

    // Enviar el estado actual de inmediato para que la UI no arranque vacía
    socket.emit('telemetria', instantanea());

    socket.on('disconnect', () => {
      console.log(`🌐 Cliente desconectado (${socket.id}) · total: ${io.engine.clientsCount}`);
    });
  });

  bus.on('telemetria', (datos) => io.emit('telemetria', datos));
  bus.on('alarma', (datos) => io.emit('alarma', datos));
  bus.on('alarma-resuelta', (datos) => io.emit('alarma-resuelta', datos));
  bus.on('evento', (datos) => io.emit('evento', datos));
  bus.on('ack', (datos) => io.emit('ack', datos));

  return io;
}
