/**
 * hooks/useTelemetria.js — estado en vivo de la incubadora.
 *
 * Combina la carga inicial por HTTP con las actualizaciones por WebSocket,
 * y mantiene una ventana deslizante de las últimas lecturas para las gráficas.
 */

import { useEffect, useRef, useState } from 'react';
import socket from '../services/socket';
import api from '../services/api';

const MAX_PUNTOS = 120;   // ~2 minutos de historia en vivo

export function useTelemetria() {
  const [estado, setEstado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [conectadoSocket, setConectadoSocket] = useState(socket.connected);
  const [ultimoEvento, setUltimoEvento] = useState(null);
  const cargado = useRef(false);

  useEffect(() => {
    // 1. Estado inicial por HTTP (para no mostrar la pantalla vacía)
    if (!cargado.current) {
      cargado.current = true;
      api.estado.actual()
        .then((r) => setEstado(r.estado))
        .catch(() => { /* el socket lo resolverá en cuanto conecte */ });

      // 2. Historial reciente para que las gráficas arranquen con contexto
      api.lecturas.serie(30)
        .then((r) => {
          setHistorial(
            r.serie.slice(-MAX_PUNTOS).map((f) => ({
              hora: f.ts.slice(11, 19),
              temperatura: f.temperatura,
              humedad: f.humedad,
            }))
          );
        })
        .catch(() => {});
    }

    const alConectar = () => setConectadoSocket(true);
    const alDesconectar = () => setConectadoSocket(false);

    const alRecibir = (datos) => {
      setEstado(datos);

      if (datos.conectado && datos.sensorOk) {
        setHistorial((prev) => {
          const punto = {
            hora: (datos.ultimaActualizacion ?? '').slice(11, 19),
            temperatura: datos.temperatura,
            humedad: datos.humedad,
          };
          const siguiente = [...prev, punto];
          return siguiente.length > MAX_PUNTOS ? siguiente.slice(-MAX_PUNTOS) : siguiente;
        });
      }
    };

    const alEvento = (e) => setUltimoEvento({ ...e, id: Date.now() });

    socket.on('connect', alConectar);
    socket.on('disconnect', alDesconectar);
    socket.on('telemetria', alRecibir);
    socket.on('evento', alEvento);

    return () => {
      socket.off('connect', alConectar);
      socket.off('disconnect', alDesconectar);
      socket.off('telemetria', alRecibir);
      socket.off('evento', alEvento);
    };
  }, []);

  return { estado, historial, conectadoSocket, ultimoEvento };
}

export default useTelemetria;
