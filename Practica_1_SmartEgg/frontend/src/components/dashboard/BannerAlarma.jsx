/**
 * BannerAlarma — franja superior que aparece cuando hay una condición crítica.
 */

import { TriangleAlert, BellOff, WifiOff } from 'lucide-react';
import { useState } from 'react';
import api from '../../services/api';

const ESTILOS = {
  critica: 'border-peligro-500/40 bg-peligro-500/12 text-peligro-400',
  alta: 'border-alerta-400/40 bg-alerta-400/12 text-alerta-400',
  media: 'border-calor-500/40 bg-calor-500/12 text-calor-300',
  baja: 'border-white/10 bg-white/5 text-base-300',
};

export default function BannerAlarma({ estado }) {
  const [silenciando, setSilenciando] = useState(false);

  if (!estado) return null;

  // Sin conexión con la incubadora
  if (!estado.conectado) {
    return (
      <div className="animar-aparecer flex flex-wrap items-center gap-3 rounded-2xl border
                      border-peligro-500/40 bg-peligro-500/12 px-5 py-4 text-peligro-400">
        <WifiOff size={20} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Sin conexión con la incubadora</p>
          <p className="text-xs opacity-80">
            Revise el cable USB y que el backend esté corriendo. También puede iniciarlo
            en modo simulación con <code className="numero">npm run sim</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!estado.alarma) return null;

  const info = estado.alarmaInfo ?? {};
  const estilo = ESTILOS[info.severidad] ?? ESTILOS.media;

  const silenciar = async () => {
    setSilenciando(true);
    try {
      await api.control.silenciarAlarma();
    } finally {
      setSilenciando(false);
    }
  };

  return (
    <div className={`animar-aparecer flex flex-wrap items-center gap-3 rounded-2xl border
                     px-5 py-4 ${estilo}`}>
      <TriangleAlert size={20} className="shrink-0 animar-alarma" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{info.mensaje ?? 'Condición crítica detectada'}</p>
        <p className="text-xs opacity-80">
          Severidad {info.severidad} ·{' '}
          <span className="numero">{estado.temperatura?.toFixed(1)} °C</span> ·{' '}
          <span className="numero">{estado.humedad?.toFixed(1)} %</span> ·{' '}
          {estado.ultimaActualizacion}
        </p>
      </div>
      <button onClick={silenciar} disabled={silenciando} className="btn-secundario btn-sm">
        <BellOff size={13} /> Silenciar
      </button>
    </div>
  );
}
