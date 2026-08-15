/**
 * pages/Configuracion.jsx — umbrales de control.
 *
 * Lo que se guarda aquí viaja al firmware con comandos SET: por el puerto
 * serial, así que cambia el comportamiento real de los relés.
 */

import { useEffect, useState } from 'react';
import { SlidersHorizontal, Save, RotateCcw, Info, Loader2 } from 'lucide-react';
import api, { ErrorApi } from '../services/api';
import { useTelemetria } from '../hooks/useTelemetria';
import { Panel, Campo, AvisoError } from '../components/ui';

const DEFECTO = {
  temp_min: 37.0, temp_max: 38.0, temp_critica: 39.5,
  hum_min: 50.0, hum_max: 65.0,
};

export default function Configuracion() {
  const { estado } = useTelemetria();
  const [form, setForm] = useState(DEFECTO);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.control.umbrales()
      .then((r) => setForm({ ...DEFECTO, ...r.umbrales }))
      .catch((e) => setError(e.message));
  }, []);

  const cambiar = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrores((x) => ({ ...x, [name]: undefined }));
  };

  const validar = () => {
    const e = {};
    const num = (k) => Number(form[k]);

    const rangos = {
      temp_min: [20, 45, '°C'], temp_max: [20, 45, '°C'], temp_critica: [20, 60, '°C'],
      hum_min: [10, 95, '%'], hum_max: [10, 95, '%'],
    };

    for (const [clave, [min, max, u]] of Object.entries(rangos)) {
      const v = num(clave);
      if (!Number.isFinite(v)) e[clave] = 'Debe ser un número';
      else if (v < min || v > max) e[clave] = `Debe estar entre ${min} y ${max} ${u}`;
    }

    if (!e.temp_min && !e.temp_max && num('temp_min') >= num('temp_max'))
      e.temp_min = 'La mínima debe ser menor que la máxima';

    if (!e.temp_critica && !e.temp_max && num('temp_critica') <= num('temp_max'))
      e.temp_critica = 'La crítica debe ser mayor que la máxima';

    if (!e.hum_min && !e.hum_max && num('hum_min') >= num('hum_max'))
      e.hum_min = 'La mínima debe ser menor que la máxima';

    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const guardar = async (ev) => {
    ev.preventDefault();
    setError(''); setAviso('');
    if (!validar()) return;

    setGuardando(true);
    try {
      const r = await api.control.guardarUmbrales({
        temp_min: Number(form.temp_min),
        temp_max: Number(form.temp_max),
        temp_critica: Number(form.temp_critica),
        hum_min: Number(form.hum_min),
        hum_max: Number(form.hum_max),
      });
      setAviso(r.advertencia ?? 'Umbrales guardados y enviados al Arduino');
      setTimeout(() => setAviso(''), 5000);
    } catch (e) {
      if (e instanceof ErrorApi && e.detalles?.length) setErrores(e.porCampo());
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const restaurar = () => { setForm(DEFECTO); setErrores({}); };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="mt-0.5 text-sm text-base-400">
          Umbrales del control automático por histéresis
        </p>
      </div>

      <AvisoError mensaje={error} onCerrar={() => setError('')} />

      {aviso && (
        <div className="animar-aparecer rounded-xl border border-ok-500/30 bg-ok-500/10
                        px-4 py-3 text-sm font-medium text-ok-400">
          ✓ {aviso}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel titulo="Umbrales de control" icono={SlidersHorizontal}>
            <form onSubmit={guardar} className="space-y-5" noValidate>

              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-calor-400">
                  Temperatura
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Campo
                    etiqueta="Mínima (°C)" nombre="temp_min" tipo="number" requerido
                    valor={form.temp_min} onChange={cambiar} error={errores.temp_min}
                    step="0.1" min={20} max={45}
                    ayuda="Enciende la calefacción"
                  />
                  <Campo
                    etiqueta="Máxima (°C)" nombre="temp_max" tipo="number" requerido
                    valor={form.temp_max} onChange={cambiar} error={errores.temp_max}
                    step="0.1" min={20} max={45}
                    ayuda="Enciende el ventilador"
                  />
                  <Campo
                    etiqueta="Crítica (°C)" nombre="temp_critica" tipo="number" requerido
                    valor={form.temp_critica} onChange={cambiar} error={errores.temp_critica}
                    step="0.1" min={20} max={60}
                    ayuda="Dispara la alarma"
                  />
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-humedad-400">
                  Humedad relativa
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo
                    etiqueta="Mínima (%)" nombre="hum_min" tipo="number" requerido
                    valor={form.hum_min} onChange={cambiar} error={errores.hum_min}
                    step="0.1" min={10} max={95}
                    ayuda="Por debajo dispara alarma"
                  />
                  <Campo
                    etiqueta="Máxima (%)" nombre="hum_max" tipo="number" requerido
                    valor={form.hum_max} onChange={cambiar} error={errores.hum_max}
                    step="0.1" min={10} max={95}
                    ayuda="Por encima enciende el ventilador"
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button type="button" onClick={restaurar} className="btn-secundario">
                  <RotateCcw size={15} /> Valores recomendados
                </button>
                <button type="submit" disabled={guardando} className="btn-primario">
                  {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Guardar y enviar al Arduino
                </button>
              </div>
            </form>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel titulo="Valores activos en el firmware" icono={Info}>
            <dl className="space-y-2.5 text-sm">
              {[
                ['Temp. mínima', estado?.umbrales?.tempMin, '°C'],
                ['Temp. máxima', estado?.umbrales?.tempMax, '°C'],
                ['Humedad mínima', estado?.umbrales?.humMin, '%'],
                ['Humedad máxima', estado?.umbrales?.humMax, '%'],
              ].map(([etiqueta, valor, unidad]) => (
                <div key={etiqueta} className="flex items-center justify-between">
                  <dt className="text-base-400">{etiqueta}</dt>
                  <dd className="numero font-semibold">
                    {valor != null ? `${valor} ${unidad}` : '—'}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="ayuda mt-4">
              Estos valores son los que el Arduino está usando ahora mismo. Si no coinciden con
              el formulario, presione «Guardar» para sincronizarlos.
            </p>
          </Panel>

          <Panel titulo="Cómo funciona el control">
            <ul className="space-y-2.5 text-xs leading-relaxed text-base-400">
              <li>
                <strong className="text-calor-400">Calefacción:</strong> enciende cuando la
                temperatura baja del mínimo y apaga al superarlo por 0.3 °C (histéresis), para que
                el relé no conmute sin parar.
              </li>
              <li>
                <strong className="text-humedad-400">Ventilador:</strong> enciende si la
                temperatura pasa del máximo o si la humedad supera su límite.
              </li>
              <li>
                <strong className="text-peligro-400">Alarma:</strong> el buzzer suena de forma
                intermitente ante sobrecalentamiento, humedad fuera de rango, puerta abierta o
                fallo del DHT22.
              </li>
              <li>
                <strong className="text-ok-400">Seguridad:</strong> por encima de la temperatura
                crítica la calefacción se corta aunque esté forzada en modo manual.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
