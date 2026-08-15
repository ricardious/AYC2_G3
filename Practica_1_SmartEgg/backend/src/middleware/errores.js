/**
 * middleware/errores.js — manejo uniforme de errores de la API.
 *
 * Todas las respuestas de error tienen la misma forma:
 *   { ok: false, error: "mensaje", detalles: [...] }
 */

export class ErrorHttp extends Error {
  constructor(estado, mensaje, detalles = null) {
    super(mensaje);
    this.estado = estado;
    this.detalles = detalles;
  }
}

export const noEncontrado = (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
};

// eslint-disable-next-line no-unused-vars
export const manejadorErrores = (err, req, res, _next) => {
  const estado = err.estado ?? 500;

  if (estado >= 500) {
    console.error('💥', err);
  }

  res.status(estado).json({
    ok: false,
    error: err.message ?? 'Error interno del servidor',
    ...(err.detalles ? { detalles: err.detalles } : {}),
  });
};

/** Envuelve un handler async para que sus errores lleguen al middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
