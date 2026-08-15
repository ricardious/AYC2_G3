/**
 * pages/Lotes.jsx — administración de lotes de incubación (CRUD completo).
 */

import { useEffect, useState } from 'react';
import { Boxes, Plus, Pencil, Trash2, Egg } from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { ErrorApi } from '../services/api';
import { Panel, Campo, Modal, Cargando, EstadoVacio, AvisoError } from '../components/ui';
import { hoyLocal } from '../utils/fechas';

const VACIO = {
  codigo: '', especie: 'Gallina', raza: '', origen: '', responsable: '',
  fecha_ingreso: hoyLocal(),
  dias_incubacion: 21, temperatura_objetivo: 37.5, humedad_objetivo: 57.5,
  notas: '', estado: 'activo',
};

export default function Lotes() {
  const [lotes, setLotes] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);      // null | { modo, datos }
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const cargar = () => {
    api.lotes.listar()
      .then((r) => setLotes(r.lotes))
      .catch((e) => { setError(e.message); setLotes([]); });
  };

  useEffect(cargar, []);

  const abrirNuevo = () => {
    setForm(VACIO); setErrores({}); setModal({ modo: 'crear' });
  };

  const abrirEdicion = (lote) => {
    setForm({ ...VACIO, ...lote });
    setErrores({});
    setModal({ modo: 'editar', id: lote.id });
  };

  const cambiar = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrores((x) => ({ ...x, [name]: undefined }));
  };

  /** Validación en el cliente: los mismos límites que aplica el backend. */
  const validar = () => {
    const e = {};
    if (!form.codigo.trim()) e.codigo = 'El código es obligatorio';
    else if (!/^[A-Za-z0-9-]{3,30}$/.test(form.codigo.trim()))
      e.codigo = 'Entre 3 y 30 caracteres: letras, números y guiones';

    if (!form.especie.trim()) e.especie = 'Indique la especie';
    else if (form.especie.trim().length < 3) e.especie = 'Mínimo 3 caracteres';

    if (!form.fecha_ingreso) e.fecha_ingreso = 'Seleccione la fecha de ingreso';
    else if (form.fecha_ingreso > hoyLocal())
      e.fecha_ingreso = 'No puede ser una fecha futura';

    const dias = Number(form.dias_incubacion);
    if (!Number.isInteger(dias) || dias < 1 || dias > 60)
      e.dias_incubacion = 'Debe ser un entero entre 1 y 60';

    const temp = Number(form.temperatura_objetivo);
    if (!Number.isFinite(temp) || temp < 30 || temp > 42)
      e.temperatura_objetivo = 'Debe estar entre 30 y 42 °C';

    const hum = Number(form.humedad_objetivo);
    if (!Number.isFinite(hum) || hum < 20 || hum > 90)
      e.humedad_objetivo = 'Debe estar entre 20 y 90 %';

    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const enviar = async (ev) => {
    ev.preventDefault();
    setError('');
    if (!validar()) return;

    const datos = {
      ...form,
      dias_incubacion: Number(form.dias_incubacion),
      temperatura_objetivo: Number(form.temperatura_objetivo),
      humedad_objetivo: Number(form.humedad_objetivo),
    };

    setEnviando(true);
    try {
      if (modal.modo === 'crear') await api.lotes.crear(datos);
      else await api.lotes.actualizar(modal.id, datos);
      setModal(null);
      cargar();
    } catch (e) {
      if (e instanceof ErrorApi && e.detalles?.length) setErrores(e.porCampo());
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const eliminar = async (lote) => {
    if (!confirm(`¿Eliminar el lote ${lote.codigo}? También se borrarán sus fichas de huevo.`)) return;
    try {
      await api.lotes.eliminar(lote.id);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lotes de incubación</h1>
          <p className="mt-0.5 text-sm text-base-400">
            Grupos de huevos que ingresan juntos a la incubadora
          </p>
        </div>
        <button onClick={abrirNuevo} className="btn-primario">
          <Plus size={16} /> Nuevo lote
        </button>
      </div>

      <AvisoError mensaje={error} onCerrar={() => setError('')} />

      <Panel titulo={`Lotes registrados${lotes ? ` (${lotes.length})` : ''}`} icono={Boxes} sinRelleno>
        {lotes === null ? (
          <Cargando />
        ) : lotes.length === 0 ? (
          <EstadoVacio
            icono={Boxes}
            titulo="Todavía no hay lotes"
            descripcion="Registre el primer lote para poder asignarle fichas de huevo."
            accion={<button onClick={abrirNuevo} className="btn-primario btn-sm"><Plus size={14} /> Crear lote</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Especie / raza</th>
                  <th>Ingreso</th>
                  <th>Progreso</th>
                  <th>Huevos</th>
                  <th>Estado</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.id}>
                    <td className="numero font-semibold text-calor-300">{l.codigo}</td>
                    <td>
                      <p>{l.especie}</p>
                      {l.raza && <p className="text-xs text-base-600">{l.raza}</p>}
                    </td>
                    <td className="numero text-base-300">{l.fecha_ingreso}</td>
                    <td className="min-w-40">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-base-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-calor-600 to-calor-300"
                            style={{ width: `${l.progreso}%` }}
                          />
                        </div>
                        <span className="numero text-xs text-base-400">
                          día {l.dias_transcurridos}/{l.dias_incubacion}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="insignia-neutra"><Egg size={11} /> {l.total_huevos}</span>
                    </td>
                    <td>
                      <span className={
                        l.estado === 'activo' ? 'insignia-ok'
                          : l.estado === 'finalizado' ? 'insignia-neutra' : 'insignia-peligro'
                      }>
                        {l.estado}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Link to={`/huevos?lote=${l.id}`} className="btn-fantasma btn-sm" title="Ver huevos">
                          <Egg size={14} />
                        </Link>
                        <button onClick={() => abrirEdicion(l)} className="btn-fantasma btn-sm" title="Editar">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => eliminar(l)} className="btn-fantasma btn-sm text-peligro-400" title="Eliminar">
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

      {/* ---------- Formulario ---------- */}
      <Modal
        abierto={Boolean(modal)}
        titulo={modal?.modo === 'crear' ? 'Registrar nuevo lote' : 'Editar lote'}
        onCerrar={() => setModal(null)}
      >
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              etiqueta="Código del lote" nombre="codigo" requerido
              valor={form.codigo} onChange={cambiar} error={errores.codigo}
              placeholder="LOTE-2026-01" ayuda="Letras, números y guiones"
            />
            <Campo
              etiqueta="Especie" nombre="especie" requerido
              valor={form.especie} onChange={cambiar} error={errores.especie}
              placeholder="Gallina"
            />
            <Campo
              etiqueta="Raza" nombre="raza"
              valor={form.raza} onChange={cambiar} error={errores.raza}
              placeholder="Rhode Island Red"
            />
            <Campo
              etiqueta="Origen" nombre="origen"
              valor={form.origen} onChange={cambiar} error={errores.origen}
              placeholder="Finca San José, Sacatepéquez"
            />
            <Campo
              etiqueta="Responsable" nombre="responsable"
              valor={form.responsable} onChange={cambiar} error={errores.responsable}
              placeholder="Ing. Agr. …"
            />
            <Campo
              etiqueta="Fecha de ingreso" nombre="fecha_ingreso" tipo="date" requerido
              valor={form.fecha_ingreso} onChange={cambiar} error={errores.fecha_ingreso}
              max={hoyLocal()}
            />
            <Campo
              etiqueta="Días de incubación" nombre="dias_incubacion" tipo="number" requerido
              valor={form.dias_incubacion} onChange={cambiar} error={errores.dias_incubacion}
              min={1} max={60} ayuda="Gallina 21 · pato 28 · codorniz 17"
            />
            <Campo
              etiqueta="Estado" nombre="estado" requerido
              valor={form.estado} onChange={cambiar} error={errores.estado}
              opciones={[
                { valor: 'activo', etiqueta: 'Activo' },
                { valor: 'finalizado', etiqueta: 'Finalizado' },
                { valor: 'descartado', etiqueta: 'Descartado' },
              ]}
            />
            <Campo
              etiqueta="Temperatura objetivo (°C)" nombre="temperatura_objetivo" tipo="number"
              valor={form.temperatura_objetivo} onChange={cambiar} error={errores.temperatura_objetivo}
              step="0.1" min={30} max={42}
            />
            <Campo
              etiqueta="Humedad objetivo (%)" nombre="humedad_objetivo" tipo="number"
              valor={form.humedad_objetivo} onChange={cambiar} error={errores.humedad_objetivo}
              step="0.1" min={20} max={90}
            />
          </div>

          <Campo
            etiqueta="Notas" nombre="notas" filas={3}
            valor={form.notas} onChange={cambiar} error={errores.notas}
            placeholder="Observaciones del lote…"
          />

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal(null)} className="btn-secundario">
              Cancelar
            </button>
            <button type="submit" disabled={enviando} className="btn-primario">
              {enviando ? 'Guardando…' : 'Guardar lote'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
