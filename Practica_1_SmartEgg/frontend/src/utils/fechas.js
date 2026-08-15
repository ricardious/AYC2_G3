/**
 * utils/fechas.js — manejo de fechas en hora LOCAL.
 *
 * Ojo: `new Date().toISOString().slice(0,10)` devuelve la fecha en UTC.
 * En Guatemala (UTC−6) eso adelanta un día a partir de las 18:00, con lo que
 * el formulario proponía una fecha futura y el backend la rechazaba.
 * Estas funciones siempre trabajan con la hora local del navegador.
 */

const dosDigitos = (n) => String(n).padStart(2, '0');

/** Fecha local en formato AAAA-MM-DD. */
export function hoyLocal(fecha = new Date()) {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** Fecha y hora local en formato AAAA-MM-DD HH:MM:SS (igual que el backend). */
export function ahoraLocal(fecha = new Date()) {
  return `${hoyLocal(fecha)} ${dosDigitos(fecha.getHours())}:`
    + `${dosDigitos(fecha.getMinutes())}:${dosDigitos(fecha.getSeconds())}`;
}

/** Días completos transcurridos desde una fecha AAAA-MM-DD. */
export function diasDesde(fechaTexto) {
  if (!fechaTexto) return 0;
  const inicio = new Date(`${fechaTexto}T00:00:00`);
  return Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 86_400_000));
}
