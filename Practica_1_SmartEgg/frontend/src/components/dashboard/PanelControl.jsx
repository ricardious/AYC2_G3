/**
 * PanelControl — control remoto de los actuadores.
 *
 * Cada botón traduce a un comando serial que viaja
 * navegador → API REST → puerto USB → firmware.
 */

import { useState } from 'react';
import {
  Flame, Wind, RotateCw, BellOff, Power, Loader2, DoorOpen, Egg, Thermometer,
} from 'lucide-react';
import api from '../../services/api';
import { Punto } from '../ui';

// Las clases de color se escriben completas: Tailwind no puede generar
// nombres construidos en tiempo de ejecución como `text-${color}-400`.
const COLOR_ICONO = {
  calor: 'text-calor-400',
  humedad: 'text-humedad-400',
  ok: 'text-ok-400',
  peligro: 'text-peligro-400',
};

function Actuador({ nombre, icono: Icono, encendido, detalle, color, children }) {
  return (
    <div className="rounded-xl border border-white/8 bg-base-950/40 p-3.5">
      <div className="flex items-center gap-2.5">
        <Icono size={16} className={encendido ? COLOR_ICONO[color] : 'text-base-600'} />
        <span className="flex-1 text-sm font-medium">{nombre}</span>
        <Punto activo={encendido} color={color} />
      </div>
      {detalle && <p className="mt-1 text-[11px] text-base-600">{detalle}</p>}
      {children && <div className="mt-3 flex gap-1.5">{children}</div>}
    </div>
  );
}

export default function PanelControl({ estado, onError }) {
  const [ocupado, setOcupado] = useState(null);

  const ejecutar = async (id, accion) => {
    setOcupado(id);
    try {
      await accion();
    } catch (e) {
      onError?.(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const Boton = ({ id, onClick, children, variante = 'btn-secundario', ...resto }) => (
    <button
      className={`${variante} btn-sm flex-1`}
      onClick={() => ejecutar(id, onClick)}
      disabled={ocupado !== null}
      {...resto}
    >
      {ocupado === id ? <Loader2 size={12} className="animate-spin" /> : children}
    </button>
  );

  const simulacion = estado?.fuente === 'simulador';

  return (
    <div className="space-y-3">

      {/* Sistema completo */}
      <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-base-950/40 p-3.5">
        <Power size={16} className={estado?.sistemaActivo ? 'text-ok-400' : 'text-base-600'} />
        <div className="flex-1">
          <p className="text-sm font-medium">Sistema de incubación</p>
          <p className="text-[11px] text-base-600">
            {estado?.sistemaActivo ? 'Operando en modo automático' : 'Detenido'}
          </p>
        </div>
        <Boton
          id="sys"
          variante={estado?.sistemaActivo ? 'btn-peligro' : 'btn-primario'}
          onClick={() => (estado?.sistemaActivo
            ? api.control.sistemaApagar()
            : api.control.sistemaEncender())}
        >
          {estado?.sistemaActivo ? 'Apagar' : 'Encender'}
        </Boton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Actuador
          nombre="Calefacción" icono={Flame} color="calor"
          encendido={estado?.calefaccion}
          detalle="Relé 1 · pin D5 · bombilla"
        >
          <Boton id="cal-on" onClick={() => api.control.calefaccion('encender')}>ON</Boton>
          <Boton id="cal-off" onClick={() => api.control.calefaccion('apagar')}>OFF</Boton>
          <Boton id="cal-auto" onClick={() => api.control.calefaccion('auto')}>Auto</Boton>
        </Actuador>

        <Actuador
          nombre="Ventilador" icono={Wind} color="humedad"
          encendido={estado?.ventilador}
          detalle="Relé 2 · pin D6"
        >
          <Boton id="ven-on" onClick={() => api.control.ventilador('encender')}>ON</Boton>
          <Boton id="ven-off" onClick={() => api.control.ventilador('apagar')}>OFF</Boton>
          <Boton id="ven-auto" onClick={() => api.control.ventilador('auto')}>Auto</Boton>
        </Actuador>

        <Actuador
          nombre="Rotación de bandeja" icono={RotateCw} color="ok"
          encendido={estado?.anguloServo !== 90}
          detalle={`Servo D9 · ${estado?.anguloServo ?? 90}° · ${estado?.rotaciones ?? 0} giros`}
        >
          <Boton id="rot" onClick={() => api.control.rotarAhora()}>
            <RotateCw size={12} /> Rotar ahora
          </Boton>
        </Actuador>

        <Actuador
          nombre="Alarma sonora" icono={BellOff} color="peligro"
          encendido={estado?.buzzer}
          detalle="Buzzer · pin D7"
        >
          <Boton id="alm" onClick={() => api.control.silenciarAlarma()}>
            <BellOff size={12} /> Silenciar
          </Boton>
        </Actuador>
      </div>

      {/* Utilidades exclusivas del modo simulación */}
      {simulacion && (
        <div className="rounded-xl border border-humedad-500/25 bg-humedad-500/8 p-3.5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-humedad-300">
            Simulación · provocar condiciones
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Boton id="sim-puerta" onClick={() => api.control.simPuerta()}>
              <DoorOpen size={12} /> Puerta
            </Boton>
            <Boton id="sim-sensor" onClick={() => api.control.simSensor()}>
              <Thermometer size={12} /> Fallo DHT
            </Boton>
            {[1, 2, 3, 4].map((n) => (
              <Boton key={n} id={`sim-esp-${n}`} onClick={() => api.control.simEspacio(n)}>
                <Egg size={12} /> {n}
              </Boton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
