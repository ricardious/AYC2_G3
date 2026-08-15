/**
 * components/ui.jsx — piezas de interfaz reutilizables en toda la aplicación.
 */

import { AlertCircle, Loader2, Inbox, X } from 'lucide-react';
import { useEffect } from 'react';

/* -------------------------------------------------------------------------- */
/*  Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function Panel({ titulo, icono: Icono, accion, children, className = '', sinRelleno }) {
  return (
    <section className={`panel ${className}`}>
      {titulo && (
        <header className="panel-titulo justify-between">
          <span className="flex items-center gap-2">
            {Icono && <Icono size={15} className="text-calor-400" />}
            {titulo}
          </span>
          {accion}
        </header>
      )}
      <div className={sinRelleno ? '' : 'px-5 pb-5'}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Campo de formulario con validación                                         */
/* -------------------------------------------------------------------------- */

export function Campo({
  etiqueta, nombre, tipo = 'text', valor, onChange, error, ayuda,
  requerido, opciones, filas, ...resto
}) {
  const id = `campo-${nombre}`;
  const clases = `campo ${error ? 'campo-error' : ''}`;

  return (
    <div>
      <label htmlFor={id} className="etiqueta">
        {etiqueta}
        {requerido && <span className="ml-1 text-peligro-400">*</span>}
      </label>

      {opciones ? (
        <select
          id={id} name={nombre} value={valor ?? ''} onChange={onChange}
          className={clases}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...resto}
        >
          <option value="">Seleccione…</option>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
          ))}
        </select>
      ) : filas ? (
        <textarea
          id={id} name={nombre} value={valor ?? ''} onChange={onChange}
          rows={filas} className={`${clases} resize-y`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...resto}
        />
      ) : (
        <input
          id={id} name={nombre} type={tipo} value={valor ?? ''} onChange={onChange}
          className={clases}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...resto}
        />
      )}

      {error && (
        <p id={`${id}-error`} className="mensaje-error" role="alert">
          <AlertCircle size={13} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {!error && ayuda && <p className="ayuda">{ayuda}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Estados auxiliares                                                         */
/* -------------------------------------------------------------------------- */

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-base-400">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

export function EstadoVacio({ icono: Icono = Inbox, titulo, descripcion, accion }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="rounded-2xl bg-white/5 p-4">
        <Icono size={26} className="text-base-600" />
      </div>
      <div>
        <p className="font-semibold text-base-300">{titulo}</p>
        {descripcion && <p className="mt-1 max-w-sm text-sm text-base-600">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

export function AvisoError({ mensaje, onCerrar }) {
  if (!mensaje) return null;
  return (
    <div
      role="alert"
      className="animar-aparecer flex items-start gap-3 rounded-xl border border-peligro-500/30
                 bg-peligro-500/10 px-4 py-3 text-sm text-peligro-400"
    >
      <AlertCircle size={17} className="mt-0.5 shrink-0" />
      <p className="flex-1">{mensaje}</p>
      {onCerrar && (
        <button onClick={onCerrar} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Cerrar">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal                                                                      */
/* -------------------------------------------------------------------------- */

export function Modal({ abierto, titulo, onCerrar, children, ancho = 'max-w-2xl' }) {
  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alTecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alTecla);
      document.body.style.overflow = '';
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-base-950/80 p-0
                 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className={`animar-aparecer panel w-full ${ancho} max-h-[92dvh] overflow-y-auto
                    rounded-b-none sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4
                           border-b border-white/8 bg-base-900/95 px-5 py-4 backdrop-blur">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button onClick={onCerrar} className="btn-fantasma btn-sm" aria-label="Cerrar">
            <X size={16} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Indicador de conexión                                                      */
/* -------------------------------------------------------------------------- */

export function Punto({ activo, color = 'ok' }) {
  const colores = {
    ok: 'bg-ok-400',
    calor: 'bg-calor-400',
    humedad: 'bg-humedad-400',
    peligro: 'bg-peligro-400',
    apagado: 'bg-base-600',
  };
  const c = activo ? colores[color] : colores.apagado;

  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
      {activo && <span className={`absolute inline-flex h-full w-full rounded-full ${c} animar-latido`} />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${c}`} />
    </span>
  );
}
