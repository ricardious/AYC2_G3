/**
 * db/seed.js — datos de ejemplo para desarrollar y para la demostración.
 *
 *   npm run seed        → agrega datos de ejemplo
 *   npm run reset-db    → borra la base y la vuelve a crear con los ejemplos
 */

import fs from 'node:fs';
import { config, ahora, hoy } from '../config.js';

// --reset borra el archivo ANTES de que db/index.js lo abra
if (process.argv.includes('--reset')) {
  for (const sufijo of ['', '-wal', '-shm']) {
    const archivo = config.db.archivo + sufijo;
    if (fs.existsSync(archivo)) {
      fs.unlinkSync(archivo);
      console.log(`🗑️  Eliminado ${archivo}`);
    }
  }
}

const { db } = await import('./index.js');

const TECNICOS = [
  ['Alex Ricardo Castañeda Rodríguez', 'alex.castaneda', '2023', '202300476', 'supervisor'],
  ['Carlos Javier Pérez Pocón', 'carlos.perez', '2022', '202206425', 'tecnico'],
  ['José Adrian Orozco Ramírez', 'jose.orozco', '2021', '202210908', 'tecnico'],
  ['Alex Oswaldo López Alquejay', 'alex.lopez', '2010', '202100171', 'tecnico'],
  ['Kevin Rodrigo Sandoval Hernández', 'kevin.sandoval', '2001', '202001376', 'tecnico'],
];

const insertarTecnico = db.prepare(
  `INSERT OR IGNORE INTO tecnicos (nombre, usuario, pin, carne, rol, creado_en)
   VALUES (?, ?, ?, ?, ?, ?)`
);

for (const [nombre, usuario, pin, carne, rol] of TECNICOS) {
  insertarTecnico.run(nombre, usuario, pin, carne, rol, ahora());
}
console.log(`👤 ${TECNICOS.length} técnicos asegurados`);

// --- Lote de ejemplo -------------------------------------------------------
const fechaIngreso = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

let lote = db.prepare('SELECT * FROM lotes WHERE codigo = ?').get('LOTE-2026-01');

if (!lote) {
  const info = db.prepare(`
    INSERT INTO lotes (codigo, especie, raza, origen, responsable, fecha_ingreso,
                       dias_incubacion, temperatura_objetivo, humedad_objetivo,
                       notas, estado, creado_en)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    'LOTE-2026-01', 'Gallina', 'Rhode Island Red', 'Finca San José, Sacatepéquez',
    'Ing. Agr. Gabriel Díaz', fechaIngreso, 21, 37.5, 57.5,
    'Lote piloto para validar el prototipo SmartEgg.', 'activo', ahora()
  );
  lote = db.prepare('SELECT * FROM lotes WHERE id = ?').get(info.lastInsertRowid);
  console.log(`🥚 Lote ${lote.codigo} creado`);
}

// --- Huevos en las 4 posiciones -------------------------------------------
const HUEVOS = [
  ['H-001', 1, 58.2, 'Cáscara uniforme, sin fisuras.'],
  ['H-002', 2, 61.0, 'Ligera mancha en el polo romo.'],
  ['H-003', 3, 55.7, 'Huevo más pequeño del lote.'],
  ['H-004', 4, 59.4, 'Control de referencia.'],
];

const insertarHuevo = db.prepare(`
  INSERT OR IGNORE INTO huevos (lote_id, codigo, posicion, peso_gramos,
                                fecha_ingreso, estado, observaciones,
                                registrado_por, creado_en)
  VALUES (?,?,?,?,?,?,?,?,?)
`);

const tecnico = db.prepare('SELECT id FROM tecnicos WHERE usuario = ?').get('carlos.perez');

for (const [codigo, posicion, peso, obs] of HUEVOS) {
  insertarHuevo.run(
    lote.id, codigo, posicion, peso, fechaIngreso, 'incubando', obs,
    tecnico?.id ?? null, ahora()
  );
}
console.log(`🥚 ${HUEVOS.length} huevos asegurados en las 4 posiciones`);

// --- Historial de lecturas del día (para que las gráficas y el PDF no salgan vacíos)
const yaHay = db.prepare('SELECT COUNT(*) AS n FROM lecturas WHERE date(ts) = ?').get(hoy()).n;

if (yaHay < 50) {
  const insertar = db.prepare(`
    INSERT INTO lecturas (ts, temperatura, humedad, sensor_ok, calefaccion,
                          ventilador, buzzer, angulo_servo, espacios_ocupados,
                          espacios_libres, sistema_activo, puerta_abierta,
                          alarma, rotaciones)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const p = (n) => String(n).padStart(2, '0');
  const generar = db.transaction(() => {
    const inicio = Date.now() - 8 * 3_600_000;   // últimas 8 horas
    let temp = 36.4;
    let hum = 54.0;
    let rotaciones = 0;

    for (let i = 0; i < 480; i++) {              // una muestra por minuto
      const t = new Date(inicio + i * 60_000);
      const ts = `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} `
        + `${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;

      const calefaccion = temp < 37.0;
      const ventilador = temp > 38.0 || hum > 65;

      temp += (calefaccion ? 0.22 : 0) - (ventilador ? 0.18 : 0)
        + (24 - temp) * 0.01 + (Math.random() - 0.5) * 0.08;
      hum += (calefaccion ? 0.12 : 0) - (ventilador ? 0.3 : 0) + (Math.random() - 0.5) * 0.4;
      hum = Math.min(72, Math.max(44, hum));

      if (i % 2 === 0) rotaciones++;

      const alarma = temp >= 39.5 ? 1 : (hum < 50 || hum > 65 ? 3 : 0);

      insertar.run(
        ts, Math.round(temp * 10) / 10, Math.round(hum * 10) / 10, 1,
        calefaccion ? 1 : 0, ventilador ? 1 : 0, alarma ? 1 : 0,
        90, 4, 0, 1, 0, alarma, rotaciones
      );
    }
  });

  generar();
  console.log('📈 480 lecturas de ejemplo generadas (últimas 8 horas)');
}

// --- Alarmas de ejemplo ----------------------------------------------------
const hayAlarmas = db.prepare('SELECT COUNT(*) AS n FROM alarmas WHERE date(ts) = ?').get(hoy()).n;

if (hayAlarmas === 0) {
  const insertar = db.prepare(`
    INSERT INTO alarmas (ts, codigo, tipo, severidad, mensaje, temperatura, humedad, resuelta, ts_resuelta)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);

  const p = (n) => String(n).padStart(2, '0');
  const conHora = (h, m) => `${hoy()} ${p(h)}:${p(m)}:00`;

  insertar.run(conHora(8, 12), 4, 'puerta_abierta', 'alta',
    'Puerta de la incubadora abierta', 37.2, 56.8, 1, conHora(8, 14));
  insertar.run(conHora(11, 40), 3, 'humedad_fuera_rango', 'media',
    'Humedad fuera del rango 50–65 %', 37.6, 48.1, 1, conHora(11, 52));
  insertar.run(conHora(14, 0), 4, 'puerta_abierta', 'alta',
    'Puerta de la incubadora abierta', 37.4, 57.2, 1, conHora(14, 3));

  console.log('🚨 3 alarmas de ejemplo registradas');
}

// --- Eventos ---------------------------------------------------------------
db.prepare('INSERT INTO eventos (ts, tipo, descripcion, valor) VALUES (?,?,?,?)')
  .run(ahora(), 'sistema', 'Datos de ejemplo cargados con npm run seed', null);

console.log('\n✅ Listo. Credenciales de prueba:');
console.log('   usuario: carlos.perez    PIN: 2022');
console.log('   usuario: agronomo        PIN: 1234\n');
