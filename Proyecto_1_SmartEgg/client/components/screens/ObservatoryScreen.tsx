"use client";

import { useEffect, useRef, useState } from "react";
import type p5 from "p5";
import { StageBlock } from "@/components/templates/StageBlock";
import { useSmartEgg, useTelemetry } from "@/lib/state/hooks";
import {
  observatorySketch,
  type ObservatoryState,
} from "@/lib/smartegg/observatory";
import "@/styles/observatory.css";
import { useCanvasPalette } from "@/lib/hooks/useCanvasPalette";

export function ObservatoryScreen() {
  const { dashboard, connection, nodeOnline, critical, eggs } = useSmartEgg();
  const { latest, recordedAt } = useTelemetry();
  const [layer, setLayer] = useState<"temperature" | "humidity">("temperature");
  const [exploded, setExploded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const palette = useCanvasPalette();
  const state = useRef<ObservatoryState | null>(null);
  const occupied = dashboard?.latest?.occupied_slots ?? 0;
  const servo = dashboard?.actuators.find((a) => a.kind === "servo");
  const fan = dashboard?.actuators.find((a) => a.kind === "fan");
  const live =
    latest !== null && connection !== "offline" && nodeOnline !== false;
  useEffect(() => {
    state.current = {
      temperature: latest?.t ?? null,
      humidity: latest?.h ?? null,
      occupied,
      angle: servo?.value ?? null,
      fan: fan?.enabled ?? false,
      live,
      critical,
      layer,
      exploded,
      paused,
      selected,
      ...palette,
    };
  });
  useEffect(() => {
    let instance: p5 | undefined;
    let observer: ResizeObserver | undefined;
    let cancelled = false;
    import("p5")
      .then(({ default: P5 }) => {
        if (cancelled || !host.current || !state.current) return;
        instance = new P5(
          observatorySketch(() => state.current!, host.current),
          host.current,
        );
        observer = new ResizeObserver(() => {
          if (host.current && instance)
            instance.resizeCanvas(
              host.current.clientWidth,
              host.current.clientHeight,
            );
        });
        observer.observe(host.current);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      instance?.remove();
    };
  }, []);
  const egg = eggs.find((e) => e.slot_number === selected + 1);
  return (
    <StageBlock top={145} x={176} fillRight wide fluid>
      <section
        className="observatory"
        aria-label="Observatorio interactivo de la incubadora"
      >
        <div className="obs-toolbar">
          <div>
            <span className="obs-eyebrow">01 / ANATOMÍA DE UN MICROCLIMA</span>
            <h2>La vida, en equilibrio.</h2>
          </div>
          <div className="obs-segments" aria-label="Capa visual">
            <button
              aria-pressed={layer === "temperature"}
              onClick={() => setLayer("temperature")}
            >
              Temperatura
            </button>
            <button
              aria-pressed={layer === "humidity"}
              onClick={() => setLayer("humidity")}
            >
              Humedad
            </button>
          </div>
        </div>
        <div className="obs-body">
          <div className="obs-scene">
            <div className="obs-scene-label">
              <span className={live ? "text-primary" : "text-foreground-faint"}>
                ● {live ? "TELEMETRÍA ACTIVA" : "SIN SEÑAL EN VIVO"}
              </span>
              <span>VISTA ISOMÉTRICA / 2D</span>
            </div>
            <div ref={host} className="obs-canvas" />
            {(error || !latest) && (
              <div className="obs-empty" role="status">
                {error
                  ? "No se pudo cargar la visualización. Recarga la página."
                  : "Esperando la primera lectura del nodo"}
              </div>
            )}
            <div className="obs-scene-actions">
              <button
                aria-pressed={exploded}
                onClick={() => setExploded(!exploded)}
              >
                {exploded ? "− Cerrar estructura" : "+ Explorar estructura"}
              </button>
              <button aria-pressed={paused} onClick={() => setPaused(!paused)}>
                {paused ? "Reanudar movimiento" : "Pausar movimiento"}
              </button>
            </div>
          </div>
          <aside className="obs-inspector">
            <span className="obs-eyebrow">LECTURA DEL ENTORNO</span>
            <div className="obs-reading" data-layer={layer}>
              {latest
                ? (layer === "temperature" ? latest.t : latest.h).toFixed(1)
                : "—"}
              <small>{layer === "temperature" ? "°C" : "%"}</small>
            </div>
            <p>
              {layer === "temperature"
                ? "Temperatura interior"
                : "Humedad relativa"}
            </p>
            <div className="obs-spectrum" data-layer={layer} />
            <div className="obs-range">
              <span>
                {layer === "temperature"
                  ? dashboard?.config.temperature_min_c
                  : dashboard?.config.humidity_min_pct}{" "}
                · mínimo
              </span>
              <span>
                {layer === "temperature"
                  ? dashboard?.config.temperature_max_c
                  : dashboard?.config.humidity_max_pct}{" "}
                · máximo
              </span>
            </div>
            <dl className="obs-facts">
              <div>
                <dt>Ventilación</dt>
                <dd>
                  {fan ? (fan.enabled ? "Activa" : "En reposo") : "Sin dato"}
                </dd>
              </div>
              <div>
                <dt>Ángulo de bandeja</dt>
                <dd>{servo?.value != null ? `${servo.value}°` : "—"}</dd>
              </div>
              <div>
                <dt>Posiciones ocupadas</dt>
                <dd>
                  {latest
                    ? `${occupied} / ${dashboard?.occupancy.capacity ?? 4}`
                    : "—"}
                </dd>
              </div>
            </dl>
            <span className="obs-eyebrow">INSPECCIONAR POSICIÓN</span>
            <div className="obs-slots">
              {[0, 1, 2, 3].map((i) => (
                <button
                  key={i}
                  aria-label={`Posición ${i + 1}`}
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                >
                  0{i + 1}
                </button>
              ))}
            </div>
            <p className="obs-slot-detail">
              {!latest
                ? "Ocupación pendiente"
                : selected >= occupied
                  ? "Posición disponible"
                  : egg
                    ? `${egg.code} · registrado`
                    : "Ocupada · sin registro"}
            </p>
          </aside>
        </div>
        <footer className="obs-footer">
          <p>
            El color sigue la capa seleccionada; las partículas representan la
            humedad y el ventilador activa su circulación. Representación
            ilustrativa, no mapa térmico.
          </p>
          <span>
            ÚLTIMA LECTURA
            <br />
            {recordedAt
              ? new Date(recordedAt).toLocaleTimeString("es-GT")
              : "—"}
          </span>
        </footer>
      </section>
    </StageBlock>
  );
}
