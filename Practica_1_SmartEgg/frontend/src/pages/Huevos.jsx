/**
 * pages/Huevos.jsx — ficha de identificación del huevo rotulado.
 *
 * Es el formulario de registro que pidieron los ingenieros agrónomos: cada
 * huevo lleva rótulo, posición física (1–4), peso, fecha de ingreso y estado.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Egg, Plus, Pencil, Trash2, ClipboardList, Weight, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api, { ErrorApi } from '../services/api';
import { Panel, Campo, Modal, Cargando, EstadoVacio, AvisoError } from '../components/ui';
import { hoyLocal } from '../utils/fechas';

const VACIO = {
  lote_id: '', codigo: '', posicion: '', peso_gramos: '',
  fecha_ingreso: hoyLocal(),
  estado: 'incubando', observaciones: '',
};

const ESTADOS = {
  incubando: 'insignia-calor',
  eclosionado: 'insignia-ok',
  descartado: 'insignia-peligro',
};

export default function Huevos() {
  const { tecnico } = useAuth();
  const [params] = useSearchParams();

  const [huevos, setHuevos] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [posiciones, setPosiciones] = useState(null);
  const [filtroLote, setFiltroLote] = useState(params.get('lote') ?? '');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const cargar = () => {
    api.huevos.listar(filtroLote ? { lote_id: filtroLote } : {})
      .then((r) => setHuevos(r.huevos))
      .catch((e) => { setError(e.message); setHuevos([]); });
    api.huevos.posiciones().then(setPosiciones).catch(() => {});
  };

  useEffect(cargar, [filtroLote]);

  useEffect(() => {
    api.lotes.listar().then((r) => setLotes(r.lotes)).catch(() => {});
  }, []);

  const abrirNuevo = () => {
    const libre = posiciones?.posiciones?.find((p) => !p.registrado);
    setForm({
      ...VACIO,
      lote_id: filtroLote || lotes[0]?.id || '',
      posicion: libre?.posicion ?? '',
    });
    setErrores({});
    setModal({ modo: 'crear' });
  };

  const abrirEdicion = (h) => {
    setForm({ ...VACIO, ...h, peso_gramos: h.peso_gramos ?? '' });
    setErrores({});
    setModal({ modo: 'editar', id: h.id });
  };

  const cambiar = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrores((x) => ({ ...x, [name]: undefined }));
  };

  const validar = () => {
    const e = {};

    if (!form.lote_id) e.lote_id = 'Seleccione el lote al que pertenece';

    if (!form.codigo.trim()) e.codigo = 'El rótulo es obligatorio';
    else if (!/^[A-Za-z0-9-]{2,30}$/.test(form.codigo.trim()))
      e.codigo = 'Entre 2 y 30 caracteres: letras, números y guiones';

    const pos = Number(form.posicion);
    if (!form.posicion) e.posicion = 'Indique la posición en la bandeja';
    else if (!Number.isInteger(pos) || pos < 1 || pos > 4)
      e.posicion = 'La incubadora sólo tiene 4 posiciones';

    if (form.peso_gramos !== '' && form.peso_gramos !== null) {
      const peso = Number(form.peso_gramos);
      if (!Number.isFinite(peso) || peso < 20 || peso > 120)
        e.peso_gramos = 'El peso debe estar entre 20 y 120 g';
    }

    if (!form.fecha_ingreso) e.fecha_ingreso = 'Seleccione la fecha de ingreso';
    else if (form.fecha_ingreso > hoyLocal())
      e.fecha_ingreso = 'No puede ser una fecha futura';

    if (form.observaciones && form.observaciones.length > 400)
      e.observaciones = 'Máximo 400 caracteres';

    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const enviar = async (ev) => {
    ev.preventDefault();
    setError('');
    if (!validar()) return;

    const datos = {
      lote_id: Number(form.lote_id),
      codigo: form.codigo.trim(),
      posicion: Number(form.posicion),
      peso_gramos: form.peso_gramos === '' ? undefined : Number(form.peso_gramos),
      fecha_ingreso: form.fecha_ingreso,
      estado: form.estado,
      observaciones: form.observaciones || undefined,
      registrado_por: tecnico?.id,
    };

    setEnviando(true);
    try {
      if (modal.modo === 'crear') await api.huevos.crear(datos);
      else await api.huevos.actualizar(modal.id, datos);
      setModal(null);
      cargar();
    } catch (e) {
      if (e instanceof ErrorApi && e.detalles?.length) setErrores(e.porCampo());
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const eliminar = async (h) => {
    if (!confirm(`¿Eliminar la ficha del huevo ${h.codigo}?`)) return;
    try {
      await api.huevos.eliminar(h.id);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fichas de identificación</h1>
          <p className="mt-0.5 text-sm text-base-400">
            Registro de cada huevo rotulado dentro de la incubadora
          </p>
        </div>
        <button onClick={abrirNuevo} disabled={lotes.length === 0} className="btn-primario">
          <Plus size={16} /> Registrar huevo
        </button>
      </div>

      <AvisoError mensaje={error} onCerrar={() => setError('')} />

      {lotes.length === 0 && (
        <div className="rounded-xl border border-alerta-400/30 bg-alerta-400/10 px-4 py-3 text-sm text-alerta-400">
          Primero debe registrar al menos un lote en la sección <strong>Lotes</strong>.
        </div>
      )}

      {/* Resumen de ocupación */}
      {posiciones && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="panel p-4">
            <p className="text-xs uppercase tracking-wide text-base-400">Posiciones ocupadas</p>
            <p className="numero mt-1 text-2xl font-bold text-calor-300">
              {posiciones.ocupadosRegistro} / {posiciones.totalEspacios}
            </p>
          </div>
          <div className="panel p-4">
            <p className="text-xs uppercase tracking-wide text-base-400">Detectadas por sensor</p>
            <p className="numero mt-1 text-2xl font-bold text-humedad-300">
              {posiciones.ocupadosSensor} / {posiciones.totalEspacios}
            </p>
          </div>
          <div className="panel p-4">
            <p className="text-xs uppercase tracking-wide text-base-400">Discrepancias</p>
            <p className={`numero mt-1 text-2xl font-bold ${
              posiciones.posiciones.some((p) => p.discrepancia) ? 'text-alerta-400' : 'text-ok-400'
            }`}>
              {posiciones.posiciones.filter((p) => p.discrepancia).length}
            </p>
          </div>
        </div>
      )}

      <Panel
        titulo="Huevos registrados" icono={ClipboardList} sinRelleno
        accion={
          <select
            value={filtroLote}
            onChange={(e) => setFiltroLote(e.target.value)}
            className="campo max-w-52 py-1.5 text-xs normal-case"
          >
            <option value="">Todos los lotes</option>
            {lotes.map((l) => <option key={l.id} value={l.id}>{l.codigo}</option>)}
          </select>
        }
      >
        {huevos === null ? (
          <Cargando />
        ) : huevos.length === 0 ? (
          <EstadoVacio
            icono={Egg}
            titulo="Sin fichas registradas"
            descripcion="Registre los huevos que coloque en la bandeja para llevar su trazabilidad."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Rótulo</th>
                  <th>Posición</th>
                  <th>Lote</th>
                  <th>Peso</th>
                  <th>Ingreso</th>
                  <th>Estado</th>
                  <th>Registró</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {huevos.map((h) => (
                  <tr key={h.id}>
                    <td className="numero font-semibold text-calor-300">{h.codigo}</td>
                    <td>
                      <span className="insignia-neutra"><MapPin size={11} /> {h.posicion}</span>
                    </td>
                    <td>
                      <p className="numero text-xs">{h.lote_codigo}</p>
                      <p className="text-xs text-base-600">{h.especie}</p>
                    </td>
                    <td className="numero text-base-300">
                      {h.peso_gramos ? `${h.peso_gramos} g` : '—'}
                    </td>
                    <td className="numero text-base-300">{h.fecha_ingreso}</td>
                    <td><span className={ESTADOS[h.estado] ?? 'insignia-neutra'}>{h.estado}</span></td>
                    <td className="text-xs text-base-600">{h.tecnico_nombre ?? '—'}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => abrirEdicion(h)} className="btn-fantasma btn-sm" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => eliminar(h)} className="btn-fantasma btn-sm text-peligro-400" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ---------- Formulario de registro ---------- */}
      <Modal
        abierto={Boolean(modal)}
        titulo={modal?.modo === 'crear' ? 'Ficha de identificación del huevo' : 'Editar ficha'}
        onCerrar={() => setModal(null)}
      >
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Rótulo del huevo" nombre="codigo" requerido
              valor={form.codigo} onChange={cambiar} error={errores.codigo}
              placeholder="H-001" ayuda="El mismo que escribió sobre la cáscara"
            />
            <Campo
              etiqueta="Lote" nombre="lote_id" requerido
              valor={form.lote_id} onChange={cambiar} error={errores.lote_id}
              opciones={lotes.map((l) => ({ valor: l.id, etiqueta: `${l.codigo} — ${l.especie}` }))}
            />
            <Campo
              etiqueta="Posición en la bandeja" nombre="posicion" requerido
              valor={form.posicion} onChange={cambiar} error={errores.posicion}
              opciones={[1, 2, 3, 4].map((n) => {
                const p = posiciones?.posiciones?.find((x) => x.posicion === n);
                const ocupada = p?.registrado && p.registrado.id !== modal?.id;
                return {
                  valor: n,
                  etiqueta: `Posición ${n} (pin A${n - 1})${ocupada ? ` — ocupada por ${p.registrado.codigo}` : ' — libre'}`,
                };
              })}
              ayuda="La incubadora tiene 4 espacios físicos"
            />
            <Campo
              etiqueta="Peso (gramos)" nombre="peso_gramos" tipo="number"
              valor={form.peso_gramos} onChange={cambiar} error={errores.peso_gramos}
              step="0.1" min={20} max={120} placeholder="58.5"
            />
            <Campo
              etiqueta="Fecha de ingreso" nombre="fecha_ingreso" tipo="date" requerido
              valor={form.fecha_ingreso} onChange={cambiar} error={errores.fecha_ingreso}
              max={hoyLocal()}
            />
            <Campo
              etiqueta="Estado" nombre="estado" requerido
              valor={form.estado} onChange={cambiar} error={errores.estado}
              opciones={[
                { valor: 'incubando', etiqueta: 'Incubando' },
                { valor: 'eclosionado', etiqueta: 'Eclosionado' },
                { valor: 'descartado', etiqueta: 'Descartado' },
              ]}
            />
          </div>

          <Campo
            etiqueta="Observaciones" nombre="observaciones" filas={3}
            valor={form.observaciones} onChange={cambiar} error={errores.observaciones}
            placeholder="Estado de la cáscara, manchas, tamaño…"
            maxLength={400}
          />

          {tecnico && (
            <p className="flex items-center gap-1.5 text-xs text-base-600">
              <Weight size={12} /> Se registrará a nombre de <strong className="text-base-400">{tecnico.nombre}</strong>
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(null)} className="btn-secundario">
              Cancelar
            </button>
            <button type="submit" disabled={enviando} className="btn-primario">
              {enviando ? 'Guardando…' : 'Guardar ficha'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
