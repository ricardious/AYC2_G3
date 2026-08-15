/**
 * pages/Alarmas.jsx — historial de alarmas y bitácora del sistema.
 */

import { useEffect, useState } from 'react';
import { BellRing, CheckCheck, ScrollText, Filter } from 'lucide-react';
import api from '../services/api';
import { Panel, Cargando, EstadoVacio, AvisoError } from '../components/ui';

const SEVERIDAD = {
  critica: 'insignia-peligro',
  alta: 'insignia-alerta',
  media: 'insignia-calor',
  baja: 'insignia-neutra',
};

const NOMBRES = {
  sobrecalentamiento: 'Sobrecalentamiento',
  temperatura_baja: 'Temperatura baja',
  humedad_fuera_rango: 'Humedad fuera de rango',
  puerta_abierta: 'Puerta abierta',
  fallo_sensor: 'Fallo del sensor',
};

export default function Alarmas() {
  const [alarmas, setAlarmas] = useState(null);
  const [eventos, setEventos] = useState(null);
  const [soloActivas, setSoloActivas] = useState(false);
  const [error, setError] = useState('');

  const cargar = () => {
    api.alarmas.listar(soloActivas ? { resueltas: 0, limite: 200 } : { limite: 200 })
      .then((r) => setAlarmas(r.alarmas))
      .catch((e) => { setError(e.message); setAlarmas([]); });

    api.alarmas.eventos({ limite: 60 })
      .then((r) => setEventos(r.eventos))
      .catch(() => setEventos([]));
  };

  useEffect(cargar, [soloActivas]);

  const resolver = async (id) => {
    try {
      await api.alarmas.resolver(id);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const activas = alarmas?.filter((a) => !a.resuelta).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registro de alarmas</h1>
          <p className="mt-0.5 text-sm text-base-400">
            Cada condición crítica queda guardada con su hora exacta
          </p>
        </div>
        <button
          onClick={() => setSoloActivas((v) => !v)}
          className={soloActivas ? 'btn-primario' : 'btn-secundario'}
        >
          <Filter size={15} /> {soloActivas ? 'Viendo sólo activas' : 'Ver sólo activas'}
        </button>
      </div>

      <AvisoError mensaje={error} onCerrar={() => setError('')} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-base-400">Alarmas registradas</p>
          <p className="numero mt-1 text-2xl font-bold">{alarmas?.length ?? '—'}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-base-400">Sin resolver</p>
          <p className={`numero mt-1 text-2xl font-bold ${activas ? 'text-peligro-400' : 'text-ok-400'}`}>
            {activas}
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-base-400">Eventos en bitácora</p>
          <p className="numero mt-1 text-2xl font-bold text-humedad-300">{eventos?.length ?? '—'}</p>
        </div>
      </div>

      <Panel titulo="Alarmas" icono={BellRing} sinRelleno>
        {alarmas === null ? (
          <Cargando />
        ) : alarmas.length === 0 ? (
          <EstadoVacio
            icono={CheckCheck}
            titulo="Sin alarmas registradas"
            descripcion="La incubadora se ha mantenido dentro de los rangos configurados."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Tipo</th>
                  <th>Severidad</th>
                  <th>Condición</th>
                  <th>Estado</th>
                  <th className="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {alarmas.map((a) => (
                  <tr key={a.id}>
                    <td className="numero whitespace-nowrap text-base-300">{a.ts}</td>
                    <td className="font-medium">{NOMBRES[a.tipo] ?? a.tipo}</td>
                    <td>
                      <span className={SEVERIDAD[a.severidad] ?? 'insignia-neutra'}>{a.severidad}</span>
                    </td>
                    <td className="numero text-xs text-base-400">
                      {a.temperatura != null && `${a.temperatura.toFixed(1)} °C`}
                      {a.humedad != null && ` · ${a.humedad.toFixed(1)} %`}
                    </td>
                    <td>
                      <span className={a.resuelta ? 'insignia-ok' : 'insignia-peligro'}>
                        {a.resuelta ? 'Resuelta' : 'Activa'}
                      </span>
                      {a.ts_resuelta && (
                        <p className="numero mt-1 text-[10px] text-base-600">{a.ts_resuelta}</p>
                      )}
                    </td>
                    <td className="text-right">
                      {!a.resuelta && (
                        <button onClick={() => resolver(a.id)} className="btn-secundario btn-sm">
                          <CheckCheck size={13} /> Resolver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel titulo="Bitácora del sistema" icono={ScrollText} sinRelleno>
        {eventos === null ? (
          <Cargando />
        ) : eventos.length === 0 ? (
          <EstadoVacio icono={ScrollText} titulo="Sin eventos" />
        ) : (
          <ul className="divide-y divide-white/5">
            {eventos.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                <span className="numero shrink-0 text-xs text-base-600">{e.ts.slice(11)}</span>
                <span className="insignia-neutra shrink-0">{e.tipo}</span>
                <span className="min-w-0 flex-1 text-base-300">{e.descripcion}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
