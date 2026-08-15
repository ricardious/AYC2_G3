/**
 * context/AuthContext.jsx — sesión del técnico.
 *
 * Prototipo de laboratorio: la sesión se guarda en localStorage. Es suficiente
 * para que el informe PDF lleve los datos del técnico autenticado.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const CLAVE = 'smartegg.tecnico';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [tecnico, setTecnico] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      return guardado ? JSON.parse(guardado) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (tecnico) localStorage.setItem(CLAVE, JSON.stringify(tecnico));
    else localStorage.removeItem(CLAVE);
  }, [tecnico]);

  const valor = useMemo(() => ({
    tecnico,
    autenticado: Boolean(tecnico),

    async iniciarSesion(usuario, pin) {
      const r = await api.auth.login(usuario, pin);
      setTecnico(r.tecnico);
      return r.tecnico;
    },

    cerrarSesion() {
      setTecnico(null);
    },
  }), [tecnico]);

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
