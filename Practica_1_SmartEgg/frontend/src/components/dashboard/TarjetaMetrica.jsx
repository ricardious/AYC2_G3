/**
 * TarjetaMetrica — indicador grande con barra de rango.
 *
 * Muestra el valor actual y, si se le pasan mínimo y máximo, dibuja dónde cae
 * dentro del rango objetivo. Es la lectura principal del panel.
 */

export default function TarjetaMetrica({
  etiqueta, valor, unidad, icono: Icono, color = 'calor',
  min, max, minEscala, maxEscala, activo = true, detalle,
}) {
  const paletas = {
    calor: {
      texto: 'text-calor-300', anillo: 'ring-calor-500/25', fondo: 'bg-calor-500/12',
      barra: 'bg-gradient-to-r from-calor-600 to-calor-300', punto: 'bg-calor-300',
    },
    humedad: {
      texto: 'text-humedad-300', anillo: 'ring-humedad-500/25', fondo: 'bg-humedad-500/12',
      barra: 'bg-gradient-to-r from-humedad-500 to-humedad-300', punto: 'bg-humedad-300',
    },
    ok: {
      texto: 'text-ok-400', anillo: 'ring-ok-500/25', fondo: 'bg-ok-500/12',
      barra: 'bg-gradient-to-r from-ok-500 to-ok-400', punto: 'bg-ok-400',
    },
    neutro: {
      texto: 'text-base-100', anillo: 'ring-white/10', fondo: 'bg-white/5',
      barra: 'bg-base-600', punto: 'bg-base-400',
    },
  };
  const p = paletas[color] ?? paletas.neutro;

  const hayRango = min !== undefined && max !== undefined
    && minEscala !== undefined && maxEscala !== undefined;

  const pct = (v) => Math.min(100, Math.max(0, ((v - minEscala) / (maxEscala - minEscala)) * 100));
  const dentroDeRango = hayRango && valor >= min && valor <= max;

  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-base-400">{etiqueta}</p>
          <p className={`numero mt-1.5 text-4xl font-bold ${activo ? p.texto : 'text-base-600'}`}>
            {activo && valor !== null && valor !== undefined ? valor.toFixed(1) : '--'}
            <span className="ml-1 text-lg font-medium opacity-60">{unidad}</span>
          </p>
        </div>
        {Icono && (
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1
                           ${activo ? `${p.fondo} ${p.anillo}` : 'bg-white/5 ring-white/10'}`}>
            <Icono size={19} className={activo ? p.texto : 'text-base-600'} />
          </div>
        )}
      </div>

      {hayRango && (
        <div className="mt-5">
          {/* Barra de escala con la zona objetivo resaltada */}
          <div className="relative h-2 overflow-hidden rounded-full bg-base-800">
            <div
              className="absolute inset-y-0 bg-white/10"
              style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%` }}
            />
            {activo && (
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${p.barra}`}
                style={{ width: `${pct(valor)}%` }}
              />
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-base-600">
            <span className="numero">{minEscala}{unidad}</span>
            <span className={dentroDeRango ? 'font-semibold text-ok-400' : 'font-semibold text-alerta-400'}>
              {activo
                ? (dentroDeRango ? 'En rango' : 'Fuera de rango')
                : 'Sin datos'}
              <span className="ml-1 font-normal text-base-600">
                ({min}–{max}{unidad})
              </span>
            </span>
            <span className="numero">{maxEscala}{unidad}</span>
          </div>
        </div>
      )}

      {detalle && <p className="mt-3 text-xs text-base-400">{detalle}</p>}
    </div>
  );
}
