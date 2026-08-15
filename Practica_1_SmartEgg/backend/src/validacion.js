/**
 * validacion.js — validador minimalista de cuerpos de petición.
 *
 * No usamos una librería externa a propósito: el objetivo de la práctica es
 * evidenciar el control de errores, y así queda visible cómo se hace.
 *
 * Uso:
 *   const datos = validar(req.body, {
 *     codigo:  { tipo: 'texto', requerido: true, min: 3, max: 30 },
 *     posicion:{ tipo: 'entero', requerido: true, min: 1, max: 4 },
 *   });
 */

import { ErrorHttp } from './middleware/errores.js';

const VALIDADORES = {
  texto(valor, regla, campo, errores) {
    if (typeof valor !== 'string') {
      errores.push({ campo, mensaje: 'Debe ser texto' });
      return null;
    }
    const limpio = valor.trim();
    if (regla.min !== undefined && limpio.length < regla.min) {
      errores.push({ campo, mensaje: `Debe tener al menos ${regla.min} caracteres` });
    }
    if (regla.max !== undefined && limpio.length > regla.max) {
      errores.push({ campo, mensaje: `No puede exceder ${regla.max} caracteres` });
    }
    if (regla.patron && !regla.patron.test(limpio)) {
      errores.push({ campo, mensaje: regla.mensajePatron ?? 'Formato inválido' });
    }
    return limpio;
  },

  entero(valor, regla, campo, errores) {
    const n = Number(valor);
    if (!Number.isInteger(n)) {
      errores.push({ campo, mensaje: 'Debe ser un número entero' });
      return null;
    }
    if (regla.min !== undefined && n < regla.min) {
      errores.push({ campo, mensaje: `Debe ser mayor o igual a ${regla.min}` });
    }
    if (regla.max !== undefined && n > regla.max) {
      errores.push({ campo, mensaje: `Debe ser menor o igual a ${regla.max}` });
    }
    return n;
  },

  numero(valor, regla, campo, errores) {
    const n = Number(valor);
    if (!Number.isFinite(n)) {
      errores.push({ campo, mensaje: 'Debe ser un número' });
      return null;
    }
    if (regla.min !== undefined && n < regla.min) {
      errores.push({ campo, mensaje: `Debe ser mayor o igual a ${regla.min}` });
    }
    if (regla.max !== undefined && n > regla.max) {
      errores.push({ campo, mensaje: `Debe ser menor o igual a ${regla.max}` });
    }
    return n;
  },

  fecha(valor, regla, campo, errores) {
    const texto = String(valor).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      errores.push({ campo, mensaje: 'Debe tener el formato AAAA-MM-DD' });
      return null;
    }
    if (Number.isNaN(Date.parse(texto))) {
      errores.push({ campo, mensaje: 'No es una fecha válida' });
      return null;
    }
    return texto;
  },

  opcion(valor, regla, campo, errores) {
    const texto = String(valor).trim();
    if (!regla.opciones.includes(texto)) {
      errores.push({ campo, mensaje: `Debe ser uno de: ${regla.opciones.join(', ')}` });
      return null;
    }
    return texto;
  },
};

export function validar(cuerpo, esquema) {
  const errores = [];
  const salida = {};
  const datos = cuerpo ?? {};

  for (const [campo, regla] of Object.entries(esquema)) {
    const valor = datos[campo];
    const vacio = valor === undefined || valor === null || valor === '';

    if (vacio) {
      if (regla.requerido) {
        errores.push({ campo, mensaje: 'Este campo es obligatorio' });
      } else if (regla.defecto !== undefined) {
        salida[campo] = regla.defecto;
      }
      continue;
    }

    const fn = VALIDADORES[regla.tipo];
    if (!fn) throw new Error(`Tipo de validación desconocido: ${regla.tipo}`);

    const resultado = fn(valor, regla, campo, errores);
    if (resultado !== null) salida[campo] = resultado;
  }

  if (errores.length > 0) {
    throw new ErrorHttp(400, 'Los datos enviados no son válidos', errores);
  }

  return salida;
}
