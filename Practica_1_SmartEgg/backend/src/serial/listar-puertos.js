/**
 * Utilidad: `npm run puertos`
 * Muestra los puertos serie del equipo para saber cuál poner en SERIAL_PUERTO.
 */

import { SerialPort } from 'serialport';

const VENDORS_ARDUINO = ['2341', '2a03', '1a86', '0403', '10c4'];

const puertos = await SerialPort.list();

if (puertos.length === 0) {
  console.log('No se encontró ningún puerto serie.');
  console.log('Revisa que el cable USB esté conectado y que Windows haya instalado el driver.');
  process.exit(0);
}

console.log('\nPuertos serie disponibles:\n');

for (const p of puertos) {
  const vid = (p.vendorId ?? '').toLowerCase();
  const fab = (p.manufacturer ?? '').toLowerCase();
  const probable =
    VENDORS_ARDUINO.includes(vid) || fab.includes('arduino') || fab.includes('wch') || fab.includes('ftdi');

  console.log(`  ${probable ? '👉' : '  '} ${p.path.padEnd(14)} ${p.manufacturer ?? 'desconocido'}`
    + (p.vendorId ? `  [VID:${p.vendorId} PID:${p.productId}]` : ''));
}

console.log('\nCopia el que tenga 👉 en el archivo .env:  SERIAL_PUERTO=COM3\n');
