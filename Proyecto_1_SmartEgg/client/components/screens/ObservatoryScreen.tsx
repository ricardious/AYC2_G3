"use client";

import { useEffect, useRef, useState } from "react";
import { StageBlock } from "@/components/templates/StageBlock";
import { useSmartEgg, useTelemetry } from "@/lib/state/hooks";
import type { SceneState, ObservatoryView } from "@/lib/smartegg/observatory3d";
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
  const [ready, setReady] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [view, setView] = useState<ObservatoryView>("orbit");
  const [reset, setReset] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const palette = useCanvasPalette();
  const state = useRef<SceneState | null>(null);
  const occupied = dashboard?.latest?.occupied_slots ?? 0;
  const servo = dashboard?.actuators.find((a) => a.kind === "servo");
  const fan = dashboard?.actuators.find((a) => a.kind === "fan");
  const heater = dashboard?.actuators.find((a) => a.kind === "heater");
  const buzzer = dashboard?.actuators.find((a) => a.kind === "buzzer");
  const doorOpen = dashboard?.latest?.door_open ?? null;
  const live =
    latest !== null && connection !== "offline" && nodeOnline !== false;
  useEffect(() => {
    state.current = {
      temperature: latest?.t ?? null,
      systemEnabled: dashboard?.latest?.system_enabled ?? null,
      sensorOk: dashboard?.latest?.sensor_ok ?? null,
      humidity: latest?.h ?? null,
      occupied,
      angle: servo?.value ?? null,
      fan: fan?.enabled ?? false,
      heater: heater?.enabled ?? null,
      buzzer: buzzer?.enabled ?? null,
      doorOpen,
      live,
      critical,
      layer,
      exploded,
      paused,
      selected,
      autoRotate,
      view,
      reset,
      ...palette,
    };
  });
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    import("@/lib/smartegg/observatory3d")
      .then(async ({ createObservatory }) => {
        if (cancelled || !host.current || !state.current) return;
        dispose = await createObservatory(
          host.current,
          () => state.current!,
          setSelected,
          () => setError(true),
          () => { setView("lcd"); setReset(value => value + 1); },
        );
        if (cancelled) { dispose(); return; }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      dispose?.();
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
            <span className="obs-eyebrow">OBSERVATORIO / ANATOMÍA DE UN MICROCLIMA</span>
            <h2>La vida, en equilibrio.</h2>
            <p className="obs-intro">Acércate. Gira. Descubre el sistema que cuida cada vida.</p>
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
              <span>MODELO INTERACTIVO / 3D</span>
            </div>
            <div ref={host} className="obs-canvas" role="group" aria-label="Modelo 3D. Arrastra para girar y usa la rueda para acercarte. También puedes usar los botones de vista y posición." />
            {(error || !ready) && (
              <div className="obs-loading" role="status" aria-live="polite" data-error={error}>
                <svg className="obs-loading-model" viewBox="0 0 240 220" fill="none" aria-hidden="true">
                  <ellipse cx="120" cy="192" rx="92" ry="17" stroke="currentColor" opacity=".15" />
                  <path d="M48 54 120 26 192 54 120 84Z" fill="currentColor" fillOpacity=".06" stroke="currentColor" opacity=".65" />
                  <path d="M48 54V160L120 192 192 160V54M120 84V192" stroke="currentColor" opacity=".3" />
                  <path d="M48 78 120 108 192 78M62 151 120 176 179 151" stroke="currentColor" opacity=".25" />
                  <g stroke="currentColor" strokeWidth="1.4" fill="currentColor" fillOpacity=".08">
                    <path d="M92 137c-14 0-15-13-10-24 4-10 10-14 14-7 9 15 11 29-4 31Z" />
                    <path d="M142 137c-14 0-15-13-10-24 4-10 10-14 14-7 9 15 11 29-4 31Z" />
                    <path d="M119 159c-14 0-15-13-10-24 4-10 10-14 14-7 9 15 11 29-4 31Z" />
                  </g>
                  <path className="obs-loading-scan" d="M48 72 120 102 192 72" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span className="obs-loading-kicker">OBSERVATORIO · 3D</span>
                <h3>{error ? "La cámara no pudo abrirse" : "Tu incubadora, de cerca"}</h3>
                <p>{error ? "Recarga la página para volver a intentarlo. Las lecturas siguen disponibles en el panel." : "Cargando el modelo interactivo"}</p>
                {!error && <div className="obs-loading-track" aria-hidden="true"><span /></div>}
              </div>
            )}
            <div className="obs-view-controls" aria-label="Punto de vista">
              {([ ["orbit", "Perspectiva"], ["front", "Frontal"], ["top", "Superior"], ["lcd", "Ver LCD"] ] as const).map(([value, label]) => (
                <button key={value} aria-pressed={view === value} onClick={() => { setView(value); setReset(reset + 1); }}>{label}</button>
              ))}
              <button aria-label="Restablecer cámara" onClick={() => { setView("orbit"); setReset(reset + 1); setAutoRotate(false); }}>↺</button>
            </div>
            <div className="obs-interaction-hint">ARRASTRA PARA GIRAR <span>·</span> ACERCA CON ZOOM <span>·</span> TOCA UNA POSICIÓN</div>
            <div className="obs-scene-actions">
              <button
                aria-pressed={exploded}
                onClick={() => setExploded(!exploded)}
              >
                {exploded ? "− Cerrar gabinete" : "+ Abrir gabinete"}
              </button>
              <button aria-pressed={autoRotate} onClick={() => setAutoRotate(!autoRotate)}>Órbita automática</button>
              <button aria-pressed={paused} onClick={() => setPaused(!paused)}>
                {paused ? "Reanudar movimiento" : "Pausar movimiento"}
              </button>
            </div>
          </div>
          <aside className="obs-inspector">
            <span className="obs-eyebrow">{live ? "● LECTURA DEL ENTORNO" : "○ ÚLTIMA LECTURA DISPONIBLE"}</span>
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
              <div><dt>Foco / calefacción</dt><dd>{heater ? heater.enabled ? "Encendido" : "Apagado" : "Sin dato"}</dd></div>
              <div><dt>Alarma</dt><dd>{buzzer ? buzzer.enabled ? "Activa" : "En reposo" : "Sin dato"}</dd></div>
              <div><dt>Puerta física</dt><dd>{doorOpen === null ? "Sin dato" : doorOpen ? "Abierta" : "Cerrada"}</dd></div>
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
            <p className="obs-slot-detail" aria-live="polite">
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
            Explora la estructura y selecciona una posición para inspeccionarla.
            El color identifica la capa; las partículas ilustran la humedad.
            La LCD muestra temperatura y humedad; el foco, ventilador y piloto
            reflejan el estado recibido del nodo. Abrir el gabinete aquí solo
            cambia la vista; no acciona la puerta física. Modelo ilustrativo.
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
