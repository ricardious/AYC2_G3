/**
 * BandejaHuevos — vista de las 4 posiciones físicas de la incubadora.
 *
 * Cruza dos fuentes:
 *   · el sensor de cada espacio (lo que detecta el hardware),
 *   · la ficha registrada en la base de datos.
 * Cuando no coinciden se marca la discrepancia, que es justo el tipo de
 * inconsistencia que los agrónomos necesitan detectar.
 */

import { Egg, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function BandejaHuevos({ posiciones = [], libres, ocupados, total = 4 }) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="numero text-3xl font-bold text-ok-400">{libres ?? 0}</span>
          <span className="text-sm text-base-400">
            {libres === 1 ? 'espacio disponible' : 'espacios disponibles'} de {total}
          </span>
        </div>
        <span className="insignia-neutra">
          <Egg size={12} /> {ocupados ?? 0} ocupados
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {posiciones.map((p) => {
          const ocupado = p.sensorOcupado || Boolean(p.registrado);
          return (
            <div
              key={p.posicion}
              className={`relative rounded-xl border p-3.5 transition-colors ${
                p.discrepancia
                  ? 'border-alerta-400/40 bg-alerta-400/8'
                  : ocupado
                    ? 'border-calor-500/30 bg-calor-500/8'
                    : 'border-dashed border-white/12 bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-base-400">
                  Pos. {p.posicion}
                </span>
                <span className="numero text-[10px] text-base-600">{p.pin}</span>
              </div>

              <div className="mt-3 flex items-center justify-center py-1.5">
                <Egg
                  size={30}
                  className={ocupado ? 'text-calor-300' : 'text-base-700'}
                  fill={ocupado ? 'currentColor' : 'none'}
                  strokeWidth={1.4}
                />
              </div>

              <p className={`truncate text-center text-xs font-semibold ${
                ocupado ? 'text-base-100' : 'text-base-600'
              }`}>
                {p.registrado?.codigo ?? (p.sensorOcupado ? 'Sin ficha' : 'Libre')}
              </p>

              {p.registrado && (
                <p className="truncate text-center text-[10px] text-base-600">
                  {p.registrado.lote_codigo}
                </p>
              )}

              {p.discrepancia && (
                <p className="mt-2 flex items-center justify-center gap-1 text-[10px]
                              font-semibold text-alerta-400">
                  <TriangleAlert size={10} />
                  {p.sensorOcupado ? 'Sensor sin ficha' : 'Ficha sin sensor'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <Link
        to="/huevos"
        className="mt-4 block text-center text-xs font-semibold text-calor-400 hover:text-calor-300"
      >
        Administrar fichas de huevo →
      </Link>
    </div>
  );
}
