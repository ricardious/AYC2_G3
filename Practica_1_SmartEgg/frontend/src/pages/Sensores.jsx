/**
 * pages/Sensores.jsx — "qué sensores están activos".
 *
 * Los ingenieros agrónomos pidieron poder ver de un vistazo qué sensores están
 * respondiendo y qué está haciendo cada actuador.
 */

import { useEffect, useState } from 'react';
import { Radio, Cpu, Usb, Zap } from 'lucide-react';
import { useTelemetria } from '../hooks/useTelemetria';
import api from '../services/api';
import { Panel, Cargando, Punto } from '../components/ui';

const ICONO_TIPO = {
  ambiental: '🌡️',
  presencia: '🥚',
  seguridad: '🚪',
  entrada: '🔘',
};

export default function Sensores() {
  const { estado } = useTelemetria();
  const [datos, setDatos] = useState(null);
  const [puertos, setPuertos] = useState(null);

  useEffect(() => {
    const cargar = () => api.estado.sensores().then(setDatos).catch(() => {});
    cargar();
    const id = setInterval(cargar, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.estado.puertos().then(setPuertos).catch(() => {});
  }, []);

  const activos = datos?.sensores?.filter((s) => s.activo).length ?? 0;
  const total = datos?.sensores?.length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sensores y actuadores</h1>
        <p className="mt-0.5 text-sm text-base-400">
          Diagnóstico del nodo físico conectado por UART/USB
        </p>
      </div>

      {/* Resumen */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-base-400">Sensores activos</p>
          <p className="numero mt-1 text-2xl font-bold text-ok-400">{activos} / {total}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-base-400">Microcontrolador</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold">
            <Cpu size={16} className="text-calor-400" /> Arduino UNO
          </p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-wide text-base-400">Enlace</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold">
            <Usb size={16} className={estado?.conectado ? 'text-ok-400' : 'text-peligro-400'} />
            <span className="numero">{estado?.puerto ?? 'Sin puerto'}</span>
          </p>
        </div>
      </div>

      <Panel titulo="Sensores" icono={Radio} sinRelleno>
        {!datos ? <Cargando /> : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Sensor</th>
                  <th>Tipo</th>
                  <th>Pin</th>
                  <th className="text-right">Lectura</th>
                </tr>
              </thead>
              <tbody>
                {datos.sensores.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Punto activo={s.activo} color={s.activo ? 'ok' : 'peligro'} />
                        <span className={`text-xs font-semibold ${
                          s.activo ? 'text-ok-400' : 'text-peligro-400'
                        }`}>
                          {s.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </td>
                    <td className="font-medium">
                      <span className="mr-1.5">{ICONO_TIPO[s.tipo] ?? '📟'}</span>
                      {s.nombre}
                    </td>
                    <td className="text-xs capitalize text-base-400">{s.tipo}</td>
                    <td className="numero text-xs text-base-400">{s.pin}</td>
                    <td className="numero text-right font-semibold">
                      {typeof s.valor === 'number' ? s.valor.toFixed(1) : s.valor}
                      {s.unidad && <span className="ml-0.5 text-xs opacity-60">{s.unidad}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel titulo="Actuadores" icono={Zap} sinRelleno>
        {!datos ? <Cargando /> : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Actuador</th>
                  <th>Pin</th>
                  <th className="text-right">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {datos.actuadores.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Punto activo={a.encendido} color="calor" />
                        <span className={`text-xs font-semibold ${
                          a.encendido ? 'text-calor-400' : 'text-base-600'
                        }`}>
                          {a.encendido ? 'Encendido' : 'Apagado'}
                        </span>
                      </div>
                    </td>
                    <td className="font-medium">{a.nombre}</td>
                    <td className="numero text-xs text-base-400">{a.pin}</td>
                    <td className="numero text-right text-xs text-base-400">{a.detalle ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Diagnóstico del puerto serie */}
      {puertos && (
        <Panel titulo="Puertos serie detectados" icono={Usb} sinRelleno>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr><th>Puerto</th><th>Fabricante</th><th>IDs USB</th><th className="text-right">¿Arduino?</th></tr>
              </thead>
              <tbody>
                {puertos.puertos.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-base-600">
                    No se detectó ningún puerto serie
                  </td></tr>
                ) : puertos.puertos.map((p) => (
                  <tr key={p.path}>
                    <td className="numero font-semibold">{p.path}</td>
                    <td className="text-base-400">{p.fabricante ?? '—'}</td>
                    <td className="numero text-xs text-base-600">
                      {p.vendorId ? `VID:${p.vendorId} PID:${p.productId}` : '—'}
                    </td>
                    <td className="text-right">
                      <span className={p.pareceArduino ? 'insignia-ok' : 'insignia-neutra'}>
                        {p.pareceArduino ? 'Probable' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-base-600">
            Configure el puerto en <code className="numero">backend/.env</code> con
            {' '}<code className="numero">SERIAL_PUERTO=COM3</code>, o déjelo en
            {' '}<code className="numero">AUTO</code> para detección automática.
            {puertos.modoSimulacion && ' Actualmente el backend corre en modo simulación.'}
          </p>
        </Panel>
      )}
    </div>
  );
}
