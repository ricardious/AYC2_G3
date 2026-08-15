/**
 * index.js — punto de entrada del backend de SmartEgg.
 *
 *   Arduino UNO ──USB/Serial──> puente serial ──> estado en memoria
 *                                                   │
 *                                     ┌─────────────┴─────────────┐
 *                                     ▼                           ▼
 *                                SQLite (histórico)        API REST + WebSocket
 *                                                                 │
 *                                                                 ▼
 *                                                         Frontend React
 */

import http from 'node:http';
import os from 'node:os';
import express from 'express';
import cors from 'cors';

import { config } from './config.js';
import './db/index.js';                       // crea la BD y el esquema
import { iniciarPuente, detenerPuente } from './serial/puerto.js';
import { iniciarSocket } from './realtime/socket.js';
import { noEncontrado, manejadorErrores } from './middleware/errores.js';

import rutasAuth from './routes/auth.js';
import rutasEstado from './routes/estado.js';
import rutasLecturas from './routes/lecturas.js';
import rutasLotes from './routes/lotes.js';
import rutasHuevos from './routes/huevos.js';
import rutasAlarmas from './routes/alarmas.js';
import rutasControl from './routes/control.js';
import rutasReportes from './routes/reportes.js';

const app = express();

app.use(cors({ origin: config.corsOrigen }));
app.use(express.json());

// Traza sencilla de peticiones
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on('finish', () => {
    if (req.originalUrl.startsWith('/api')) {
      console.log(`   ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - inicio}ms)`);
    }
  });
  next();
});

// --- Rutas -----------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    servicio: 'SmartEgg API',
    version: '1.0.0',
    modoSimulacion: config.simular,
    uptimeSegundos: Math.round(process.uptime()),
  });
});

app.use('/api/auth', rutasAuth);
app.use('/api/estado', rutasEstado);
app.use('/api/lecturas', rutasLecturas);
app.use('/api/lotes', rutasLotes);
app.use('/api/huevos', rutasHuevos);
app.use('/api/alarmas', rutasAlarmas);
app.use('/api/control', rutasControl);
app.use('/api/reportes', rutasReportes);

app.use(noEncontrado);
app.use(manejadorErrores);

// --- Arranque --------------------------------------------------------------
const servidor = http.createServer(app);
iniciarSocket(servidor);

servidor.listen(config.puerto, config.host, async () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║        SmartEgg · Backend IoT · Grupo 3          ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  API local     →  http://localhost:${config.puerto}/api/health`);

  // Direcciones de red local: sirven para abrir la web desde el celular,
  // que es lo que pide la rúbrica 5.3
  for (const [nombre, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  Red local     →  http://${iface.address}:${config.puerto}  (${nombre})`);
      }
    }
  }

  console.log(`  Base de datos →  ${config.db.archivo}`);
  console.log(`  Modo          →  ${config.simular ? '🧪 SIMULACIÓN (sin Arduino)' : '🔌 Arduino real'}`);
  console.log('');

  await iniciarPuente();
});

// --- Cierre ordenado -------------------------------------------------------
function cerrar() {
  console.log('\nCerrando SmartEgg...');
  detenerPuente();
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
