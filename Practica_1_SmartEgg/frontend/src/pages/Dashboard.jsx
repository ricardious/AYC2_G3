/**
 * pages/Dashboard.jsx — panel principal en tiempo real.
 *
 * Todo lo que aparece aquí llega por WebSocket, sin recargar la página:
 * temperatura, humedad, estado de actuadores, ocupación de la bandeja y alarmas.
 */

import { useEffect, useState } from 'react';
import {
  Thermometer, Droplets, Egg, Activity, Gauge, Sliders, RotateCw, Clock,
} from 'lucide-react';
import { useTelemetria } from '../hooks/useTelemetria';
import api from '../services/api';
import { Panel, AvisoError, Punto } from '../components/ui';
import TarjetaMetrica from '../components/dashboard/TarjetaMetrica';
import BandejaHuevos from '../components/dashboard/BandejaHuevos';
import GraficaAmbiente from '../components/dashboard/GraficaAmbiente';
import PanelControl from '../components/dashboard/PanelControl';
import BannerAlarma from '../components/dashboard/BannerAlarma';

function tiempoActivo(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min ${s % 60} s`;
}

export default function Dashboard() {
  const { estado, historial } = useTelemetria();
  const [posiciones, setPosiciones] = useState(null);
  const [error, setError] = useState('');

  // La ocupación viene de la BD + sensores; se refresca cada 5 s
  useEffect(() => {
    const cargar = () => api.huevos.posiciones().then(setPosiciones).catch(() => {});
    cargar();
    const id = setInterval(cargar, 5000);
    return () => clearInterval(id);
  }, []);

  const sensorActivo = Boolean(estado?.conectado && estado?.sensorOk);

  return (
    <div className="space-y-5">

      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panel de monitoreo</h1>
          <p className="mt-0.5 text-sm text-base-400">
            Lectura en vivo del nodo físico de la incubadora
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-base-400">
          <Punto activo={estado?.conectado} color={estado?.conectado ? 'ok' : 'peligro'} />
          <span className="numero">
            {estado?.ultimaActualizacion ?? 'Sin datos'}
          </span>
        </div>
      </div>

      <BannerAlarma estado={estado} />
      <AvisoError mensaje={error} onCerrar={() => setError('')} />

      {/* Métricas principales */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaMetrica
          etiqueta="Temperatura" icono={Thermometer} color="calor"
          valor={estado?.temperatura} unidad="°C" activo={sensorActivo}
          min={estado?.umbrales?.tempMin ?? 37} max={estado?.umbrales?.tempMax ?? 38}
          minEscala={20} maxEscala={45}
        />
        <TarjetaMetrica
          etiqueta="Humedad relativa" icono={Droplets} color="humedad"
          valor={estado?.humedad} unidad="%" activo={sensorActivo}
          min={estado?.umbrales?.humMin ?? 50} max={estado?.umbrales?.humMax ?? 65}
          minEscala={20} maxEscala={90}
        />

        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-base-400">
            Espacios disponibles
          </p>
          <p className="numero mt-1.5 text-4xl font-bold text-ok-400">
            {estado?.espaciosLibres ?? '--'}
            <span className="ml-1 text-lg font-medium opacity-60">
              / {(estado?.espacios?.length) || 4}
            </span>
          </p>
          <div className="mt-5 flex gap-1.5">
            {(estado?.espacios ?? [false, false, false, false]).map((ocupado, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${ocupado ? 'bg-calor-400' : 'bg-base-800'}`}
                title={`Posición ${i + 1}: ${ocupado ? 'ocupada' : 'libre'}`}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-base-400">
            Detectados por los sensores en A0–A3
          </p>
        </div>

        <div className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-base-400">
            Estado del sistema
          </p>
          <p className={`mt-1.5 text-2xl font-bold ${
            estado?.sistemaActivo ? 'text-ok-400' : 'text-base-600'
          }`}>
            {estado?.sistemaActivo ? 'Operando' : 'Detenido'}
          </p>
          <dl className="mt-4 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-base-400">
                <RotateCw size={11} /> Rotaciones
              </dt>
              <dd className="numero font-semibold">{estado?.rotaciones ?? 0}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-base-400">
                <Clock size={11} /> Encendido
              </dt>
              <dd className="numero font-semibold">{tiempoActivo(estado?.uptimeMs)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-base-400">
                <Activity size={11} /> Fuente
              </dt>
              <dd className="font-semibold capitalize">{estado?.fuente ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Gráfica + bandeja */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel titulo="Temperatura y humedad en tiempo real" icono={Gauge} className="xl:col-span-2">
          <GraficaAmbiente datos={historial} umbrales={estado?.umbrales} />
          <p className="mt-2 text-center text-[11px] text-base-600">
            La banda verde marca el rango objetivo de incubación
            ({estado?.umbrales?.tempMin ?? 37}–{estado?.umbrales?.tempMax ?? 38} °C)
          </p>
        </Panel>

        <Panel titulo="Bandeja de incubación" icono={Egg}>
          <BandejaHuevos
            posiciones={posiciones?.posiciones ?? []}
            libres={estado?.espaciosLibres}
            ocupados={estado?.espaciosOcupados}
            total={posiciones?.totalEspacios ?? 4}
          />
        </Panel>
      </div>

      {/* Control */}
      <Panel titulo="Control de actuadores" icono={Sliders}>
        <PanelControl estado={estado} onError={setError} />
      </Panel>
    </div>
  );
}
