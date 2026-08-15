/**
 * components/Layout.jsx — armazón de la aplicación: barra lateral, encabezado
 * con el estado de conexión y el área de contenido.
 *
 * En pantallas pequeñas la barra lateral se convierte en un cajón deslizante,
 * para cumplir el requisito de uso desde celular o tablet.
 */

import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Boxes, Egg, Radio, BellRing, FileText, SlidersHorizontal,
  Menu, X, LogOut, Wifi, WifiOff, FlaskConical,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTelemetria } from '../hooks/useTelemetria';
import { Punto } from './ui';

const ENLACES = [
  { a: '/', texto: 'Panel', icono: LayoutDashboard, exacto: true },
  { a: '/lotes', texto: 'Lotes', icono: Boxes },
  { a: '/huevos', texto: 'Fichas de huevo', icono: Egg },
  { a: '/sensores', texto: 'Sensores', icono: Radio },
  { a: '/alarmas', texto: 'Alarmas', icono: BellRing },
  { a: '/reportes', texto: 'Reportes', icono: FileText },
  { a: '/configuracion', texto: 'Configuración', icono: SlidersHorizontal },
];

export default function Layout() {
  const [abierto, setAbierto] = useState(false);
  const { tecnico, cerrarSesion } = useAuth();
  const { estado } = useTelemetria();
  const navegar = useNavigate();

  const conectado = estado?.conectado ?? false;
  const simulacion = estado?.fuente === 'simulador';

  const salir = () => {
    cerrarSesion();
    navegar('/login');
  };

  return (
    <div className="flex min-h-dvh">

      {/* ---------- Barra lateral ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-68 flex-col border-r border-white/8
                    bg-base-900/95 backdrop-blur-lg transition-transform duration-200
                    lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0
                    ${abierto ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: '17rem' }}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-calor-500/15
                          text-xl ring-1 ring-calor-500/30">
            🥚
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold tracking-tight">SmartEgg</p>
            <p className="truncate text-[11px] text-base-400">Incubadora IoT · Grupo 3</p>
          </div>
          <button
            onClick={() => setAbierto(false)}
            className="btn-fantasma btn-sm ml-auto lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {ENLACES.map(({ a, texto, icono: Icono, exacto }) => (
            <NavLink
              key={a}
              to={a}
              end={exacto}
              onClick={() => setAbierto(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium
                 transition-colors ${
                   isActive
                     ? 'bg-calor-500/12 text-calor-300 ring-1 ring-calor-500/25'
                     : 'text-base-300 hover:bg-white/5 hover:text-base-100'
                 }`
              }
            >
              <Icono size={17} />
              {texto}
            </NavLink>
          ))}
        </nav>

        {/* Estado de la incubadora */}
        <div className="mx-3 mb-3 rounded-xl border border-white/8 bg-base-950/50 px-3.5 py-3">
          <div className="flex items-center gap-2 text-xs">
            <Punto activo={conectado} color={conectado ? 'ok' : 'peligro'} />
            <span className={conectado ? 'text-ok-400' : 'text-peligro-400'}>
              {conectado ? 'Incubadora en línea' : 'Sin conexión'}
            </span>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-base-600">
            {simulacion ? <FlaskConical size={11} /> : conectado ? <Wifi size={11} /> : <WifiOff size={11} />}
            {simulacion ? 'Modo simulación' : estado?.puerto ?? 'Puerto no detectado'}
          </p>
        </div>

        {/* Técnico */}
        <div className="border-t border-white/8 px-3 py-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full
                            bg-humedad-500/15 text-sm font-bold text-humedad-300
                            ring-1 ring-humedad-500/25">
              {(tecnico?.nombre ?? '?').charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{tecnico?.nombre ?? 'Invitado'}</p>
              <p className="truncate text-[11px] text-base-600">{tecnico?.carne ?? tecnico?.rol}</p>
            </div>
            <button onClick={salir} className="btn-fantasma btn-sm" title="Cerrar sesión">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Fondo oscuro del cajón en móvil */}
      {abierto && (
        <div
          className="fixed inset-0 z-30 bg-base-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setAbierto(false)}
        />
      )}

      {/* ---------- Contenido ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/8
                           bg-base-950/85 px-4 py-3 backdrop-blur-lg lg:hidden">
          <button onClick={() => setAbierto(true)} className="btn-fantasma btn-sm" aria-label="Abrir menú">
            <Menu size={18} />
          </button>
          <span className="font-bold">SmartEgg</span>
          <div className="ml-auto flex items-center gap-2">
            <Punto activo={conectado} color={conectado ? 'ok' : 'peligro'} />
            {estado?.sensorOk && (
              <span className="numero text-sm text-calor-300">
                {estado.temperatura?.toFixed(1)}°C
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <Outlet />
        </main>

        <footer className="px-4 pb-6 pt-2 text-center text-[11px] text-base-600 sm:px-6 lg:px-8">
          SmartEgg · Práctica 1 · Arquitectura de Computadoras y Ensambladores 2 ·
          Universidad de San Carlos de Guatemala
        </footer>
      </div>
    </div>
  );
}
