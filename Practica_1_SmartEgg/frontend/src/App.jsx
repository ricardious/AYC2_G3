/**
 * App.jsx — rutas de la aplicación.
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Lotes from './pages/Lotes';
import Huevos from './pages/Huevos';
import Sensores from './pages/Sensores';
import Alarmas from './pages/Alarmas';
import Reportes from './pages/Reportes';
import Configuracion from './pages/Configuracion';

/** Bloquea las rutas internas si no hay técnico autenticado. */
function RutaPrivada({ children }) {
  const { autenticado } = useAuth();
  const ubicacion = useLocation();

  if (!autenticado) {
    return <Navigate to="/login" state={{ desde: ubicacion }} replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={<RutaPrivada><Layout /></RutaPrivada>}
          >
            <Route index element={<Dashboard />} />
            <Route path="lotes" element={<Lotes />} />
            <Route path="huevos" element={<Huevos />} />
            <Route path="sensores" element={<Sensores />} />
            <Route path="alarmas" element={<Alarmas />} />
            <Route path="reportes" element={<Reportes />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
