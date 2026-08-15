/**
 * pages/Login.jsx — acceso del técnico.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2, KeyRound, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Campo, AvisoError } from '../components/ui';
import api, { ErrorApi } from '../services/api';

export default function Login() {
  const { iniciarSesion, autenticado } = useAuth();
  const navegar = useNavigate();

  const [form, setForm] = useState({ usuario: '', pin: '' });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [tecnicos, setTecnicos] = useState([]);

  useEffect(() => {
    if (autenticado) navegar('/', { replace: true });
  }, [autenticado, navegar]);

  useEffect(() => {
    api.auth.tecnicos().then((r) => setTecnicos(r.tecnicos)).catch(() => {});
  }, []);

  const cambiar = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrores((x) => ({ ...x, [name]: undefined }));
  };

  /** Validación en el cliente antes de tocar la red. */
  const validar = () => {
    const e = {};
    if (!form.usuario.trim()) e.usuario = 'Ingrese su usuario';
    else if (form.usuario.trim().length < 3) e.usuario = 'Mínimo 3 caracteres';

    if (!form.pin.trim()) e.pin = 'Ingrese su PIN';
    else if (!/^\d{4,10}$/.test(form.pin.trim())) e.pin = 'El PIN debe tener entre 4 y 10 dígitos';

    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const enviar = async (ev) => {
    ev.preventDefault();
    setError('');
    if (!validar()) return;

    setEnviando(true);
    try {
      await iniciarSesion(form.usuario.trim().toLowerCase(), form.pin.trim());
      navegar('/', { replace: true });
    } catch (e) {
      if (e instanceof ErrorApi && e.detalles?.length) setErrores(e.porCampo());
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">

        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl
                          bg-calor-500/12 text-3xl ring-1 ring-calor-500/25">
            🥚
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SmartEgg</h1>
          <p className="mt-1 text-sm text-base-400">
            Incubadora Inteligente IoT · Facultad de Ingeniería USAC
          </p>
        </div>

        <form onSubmit={enviar} className="panel space-y-4 p-6" noValidate>
          <AvisoError mensaje={error} onCerrar={() => setError('')} />

          <Campo
            etiqueta="Usuario" nombre="usuario" requerido
            valor={form.usuario} onChange={cambiar} error={errores.usuario}
            placeholder="carlos.perez" autoComplete="username" autoFocus
          />

          <Campo
            etiqueta="PIN" nombre="pin" tipo="password" requerido
            valor={form.pin} onChange={cambiar} error={errores.pin}
            placeholder="••••" autoComplete="current-password"
            inputMode="numeric" maxLength={10}
          />

          <button type="submit" disabled={enviando} className="btn-primario w-full">
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {enviando ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>

        {tecnicos.length > 0 && (
          <div className="panel mt-4 p-4">
            <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold
                          uppercase tracking-wide text-base-400">
              <User size={12} /> Técnicos registrados
            </p>
            <ul className="space-y-1">
              {tecnicos.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, usuario: t.usuario }))}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left
                               text-xs text-base-400 transition-colors hover:bg-white/5 hover:text-base-100"
                  >
                    <KeyRound size={11} className="shrink-0 opacity-50" />
                    <span className="numero">{t.usuario}</span>
                    <span className="truncate opacity-60">— {t.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="ayuda">
              El PIN de prueba de cada técnico es su año de carné (ver <code>npm run seed</code>).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
