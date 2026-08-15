/**
 * pages/Reportes.jsx — vista previa del informe y descarga automática en PDF.
 */

import { useEffect, useState } from 'react';
import {
  FileText, Download, Calendar, Thermometer, Droplets, BellRing, Boxes, Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { generarReportePDF } from '../utils/reportePdf';
import { Panel, Cargando, AvisoError, EstadoVacio } from '../components/ui';
import { hoyLocal as hoy } from '../utils/fechas';



export default function Reportes() {
  const { tecnico } = useAuth();
  const [fecha, setFecha] = useState(hoy());
  const [fechas, setFechas] = useState([]);
  const [reporte, setReporte] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    api.reportes.fechas().then((r) => setFechas(r.fechas)).catch(() => {});
  }, []);

  useEffect(() => {
    setCargando(true);
    setReporte(null);
    api.reportes.diario(fecha, tecnico?.id)
      .then((r) => setReporte(r.reporte))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [fecha, tecnico]);

  const descargar = () => {
    if (!reporte) return;
    setGenerando(true);
    setError('');
    try {
      const archivo = generarReportePDF(reporte);
      setAviso(`Informe descargado: ${archivo}`);
      setTimeout(() => setAviso(''), 5000);
    } catch (e) {
      setError(`No se pudo generar el PDF: ${e.message}`);
    } finally {
      setGenerando(false);
    }
  };

  const a = reporte?.ambiental ?? {};
  const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Informes</h1>
          <p className="mt-0.5 text-sm text-base-400">
            Reporte diario en PDF con lotes, temperaturas y alarmas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Calendar size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-600" />
            <input
              type="date" value={fecha} max={hoy()}
              onChange={(e) => setFecha(e.target.value)}
              className="campo py-2 pl-9"
            />
          </div>
          <button onClick={descargar} disabled={!reporte || generando} className="btn-primario">
            {generando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Descargar PDF
          </button>
        </div>
      </div>

      <AvisoError mensaje={error} onCerrar={() => setError('')} />

      {aviso && (
        <div className="animar-aparecer rounded-xl border border-ok-500/30 bg-ok-500/10
                        px-4 py-3 text-sm font-medium text-ok-400">
          ✓ {aviso}
        </div>
      )}

      {fechas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fechas.slice(0, 10).map((f) => (
            <button
              key={f.fecha}
              onClick={() => setFecha(f.fecha)}
              className={f.fecha === fecha ? 'insignia-calor' : 'insignia-neutra'}
            >
              {f.fecha} <span className="opacity-60">({f.muestras})</span>
            </button>
          ))}
        </div>
      )}

      {cargando ? (
        <Cargando texto="Preparando el informe…" />
      ) : !reporte ? (
        <EstadoVacio icono={FileText} titulo="Sin datos para esta fecha" />
      ) : (
        <>
          {/* Resumen numérico */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="panel p-4">
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-base-400">
                <Thermometer size={12} /> Temperatura
              </p>
              <p className="numero mt-1 text-2xl font-bold text-calor-300">
                {n1(a.temp_max)} <span className="text-sm opacity-50">máx</span>
              </p>
              <p className="numero text-sm text-base-400">
                {n1(a.temp_min)} mín · {n1(a.temp_prom)} prom
              </p>
            </div>

            <div className="panel p-4">
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-base-400">
                <Droplets size={12} /> Humedad
              </p>
              <p className="numero mt-1 text-2xl font-bold text-humedad-300">
                {n1(a.hum_max)} <span className="text-sm opacity-50">máx</span>
              </p>
              <p className="numero text-sm text-base-400">
                {n1(a.hum_min)} mín · {n1(a.hum_prom)} prom
              </p>
            </div>

            <div className="panel p-4">
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-base-400">
                <BellRing size={12} /> Alarmas
              </p>
              <p className={`numero mt-1 text-2xl font-bold ${
                reporte.total_alarmas ? 'text-peligro-400' : 'text-ok-400'
              }`}>
                {reporte.total_alarmas}
              </p>
              <p className="text-sm text-base-400">registradas en el día</p>
            </div>

            <div className="panel p-4">
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-base-400">
                <Boxes size={12} /> Lotes activos
              </p>
              <p className="numero mt-1 text-2xl font-bold text-ok-400">{reporte.lotes.length}</p>
              <p className="text-sm text-base-400">
                {reporte.ocupacion.ocupados}/{reporte.ocupacion.total_espacios} espacios ocupados
              </p>
            </div>
          </div>

          {/* Gráfica por hora */}
          <Panel titulo="Máximas y mínimas por hora" icono={Thermometer}>
            {reporte.por_hora.length === 0 ? (
              <p className="py-10 text-center text-sm text-base-600">Sin lecturas registradas este día</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reporte.por_hora} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="hora" tick={{ fill: '#7d8db0', fontSize: 10 }} stroke="rgba(255,255,255,0.08)" />
                    <YAxis domain={[30, 42]} tick={{ fill: '#7d8db0', fontSize: 10 }} stroke="rgba(255,255,255,0.08)" width={42} />
                    <Tooltip
                      contentStyle={{
                        background: '#0d1424', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 12, fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
                    <Bar dataKey="temp_max" name="Máxima" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="temp_min" name="Mínima" fill="#22d3ee" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          {/* Contenido que llevará el PDF */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel titulo="Lotes incluidos en el informe" icono={Boxes} sinRelleno>
              <div className="overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr><th>Código</th><th>Especie</th><th>Día</th><th>Huevos</th></tr>
                  </thead>
                  <tbody>
                    {reporte.lotes.length === 0 ? (
                      <tr><td colSpan={4} className="py-6 text-center text-base-600">Sin lotes activos</td></tr>
                    ) : reporte.lotes.map((l) => (
                      <tr key={l.id}>
                        <td className="numero font-semibold text-calor-300">{l.codigo}</td>
                        <td>{l.especie}</td>
                        <td className="numero">{l.dias_transcurridos}/{l.dias_incubacion}</td>
                        <td className="numero">{l.total_huevos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel titulo="Alarmas incluidas en el informe" icono={BellRing} sinRelleno>
              <div className="max-h-72 overflow-y-auto">
                <table className="tabla">
                  <thead>
                    <tr><th>Hora</th><th>Tipo</th><th>Severidad</th></tr>
                  </thead>
                  <tbody>
                    {reporte.alarmas.length === 0 ? (
                      <tr><td colSpan={3} className="py-6 text-center text-ok-400">
                        Sin alarmas · todo dentro de rango
                      </td></tr>
                    ) : reporte.alarmas.map((al) => (
                      <tr key={al.id}>
                        <td className="numero">{al.ts.slice(11, 16)}</td>
                        <td className="text-xs">{al.mensaje}</td>
                        <td><span className="insignia-neutra">{al.severidad}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-semibold">El PDF incluirá</p>
              <p className="mt-1 text-xs text-base-400">
                Logo del proyecto · datos de {reporte.tecnico?.nombre ?? 'el técnico'} ·
                resumen de {reporte.lotes.length} lote(s) · historial de {reporte.por_hora.length} hora(s) ·
                {' '}{reporte.total_alarmas} alarma(s) · bitácora de eventos
              </p>
            </div>
            <button onClick={descargar} disabled={generando} className="btn-primario">
              {generando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Generar y descargar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
