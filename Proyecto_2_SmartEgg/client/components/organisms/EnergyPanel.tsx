"use client";

import { useState, type FormEvent } from "react";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import type { EnergyDevice, EnergySchedule } from "@/lib/mqtt/messages";
import { useSmartEgg } from "@/lib/state/hooks";

const DEVICE_LABEL: Record<EnergyDevice, string> = {
  heater: "FOCO",
  fan: "VENTILADOR",
};

const REASON_LABEL: Record<string, string> = {
  temporizador: "TEMPORIZADOR",
  limite_diario: "LÍMITE DIARIO",
};

const ANOMALY_LABEL: Record<string, string> = {
  foco_con_temperatura_alta: "FOCO ENCENDIDO SOBRE EL MÁXIMO",
  consumo_sistema_apagado: "CONSUMO CON EL SISTEMA APAGADO",
  promedio_alto: "PROMEDIO DE LA ÚLTIMA HORA ALTO",
};

const FIELD =
  "border border-rule bg-transparent px-2 py-1.5 font-mono text-[11px] tracking-[0.06em] text-foreground disabled:opacity-40";
const BUTTON =
  "border border-primary/60 bg-primary/8 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-foreground-fainter";
const LINK =
  "font-mono text-[10px] tracking-[0.1em] text-foreground-fainter transition-colors hover:text-foreground disabled:opacity-30";

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className={`m-0 ${tone ?? "text-foreground"}`}>{value}</dd>
    </div>
  );
}

function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Consumo eléctrico estimado y sus reglas: límite diario, temporizador y
 * horarios. El backend calcula la potencia con el estado real del foco y el
 * ventilador (docs/CONSUMO_ELECTRICO.md) y aplica las reglas en el nodo.
 */
export function EnergyPanel() {
  const { energy, actions } = useSmartEgg();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // Ediciones locales; null muestra lo que publica el backend.
  const [limitDraft, setLimit] = useState<string | null>(null);
  const [actionDraft, setLimitAction] = useState<"alert" | "heater_off" | null>(null);
  const [timerDevice, setTimerDevice] = useState<EnergyDevice>("fan");
  const [timerState, setTimerState] = useState<"on" | "off">("on");
  const [timerMinutes, setTimerMinutes] = useState("15");
  const [schedulesDraft, setSchedules] = useState<EnergySchedule[] | null>(null);
  const [draft, setDraft] = useState<EnergySchedule>({
    device: "fan",
    start: "22:00",
    end: "06:00",
    state: "off",
  });

  const limit = limitDraft ?? (energy ? String(energy.limite_wh) : "");
  const limitAction = actionDraft ?? energy?.accion_limite ?? "alert";
  const schedules = schedulesDraft ?? energy?.horarios ?? [];
  const schedulesDirty = schedulesDraft !== null;

  const send = async (payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await actions.updateEnergy(payload);
      setMessage({ text: done, error: false });
      return true;
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "No se pudo aplicar el cambio.",
        error: true,
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveLimit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(limit);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage({ text: "El límite debe ser mayor que cero.", error: true });
      return;
    }
    void send({ daily_limit_wh: value, limit_action: limitAction }, "Límite guardado.").then(
      (saved) => {
        if (!saved) return;
        setLimit(null);
        setLimitAction(null);
      },
    );
  };

  const startTimer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minutes = Math.round(Number(timerMinutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      setMessage({ text: "El temporizador va de 1 a 1440 minutos.", error: true });
      return;
    }
    void send(
      { timer: { device: timerDevice, state: timerState, minutes } },
      "Temporizador iniciado.",
    );
  };

  const saveSchedules = async () => {
    if (await send({ schedules }, "Horarios guardados.")) setSchedules(null);
  };

  const addSchedule = () => {
    if (draft.start === draft.end) {
      setMessage({ text: "La franja debe tener inicio y fin distintos.", error: true });
      return;
    }
    setSchedules([...schedules, draft]);
  };

  if (!energy) {
    return (
      <section aria-label="Consumo eléctrico" className="w-full max-w-[420px] console:w-[420px]">
        <SectionKicker>CONSUMO ELÉCTRICO</SectionKicker>
        <div className="mt-7 border-l border-primary/40 py-5 pl-4 font-mono text-[11px] tracking-[0.1em] text-foreground-muted">
          ESPERANDO LA PRIMERA LECTURA DEL NODO…
        </div>
      </section>
    );
  }

  const usage = Math.min(energy.uso_limite_pct, 100);
  const overLimit = energy.uso_limite_pct >= 100;
  const rules = Object.entries(energy.reglas_activas) as [
    EnergyDevice,
    { enabled: boolean; reason: string },
  ][];

  return (
    <section aria-label="Consumo eléctrico" className="w-full max-w-[420px] console:w-[420px]">
      <div className="flex items-end justify-between">
        <SectionKicker>CONSUMO ELÉCTRICO</SectionKicker>
        <span className="font-mono text-[10px] tracking-[0.1em] text-foreground-fainter">
          Q{energy.tarifa_q_kwh.toFixed(2)}/kWh
        </span>
      </div>

      <div className="mt-5 flex items-baseline gap-2 font-mono">
        <span className="text-[34px] leading-none text-foreground">
          {energy.potencia_w.toFixed(1)}
        </span>
        <span className="text-[11px] tracking-[0.1em] text-foreground-muted">W AHORA</span>
      </div>

      <dl className="mt-4 font-mono text-[11px] leading-[2.2] tracking-[0.1em] text-neutral">
        <Row label="FOCO" value={`${energy.desglose_w.foco.toFixed(1)} W`} />
        <Row label="VENTILADOR" value={`${energy.desglose_w.ventilador.toFixed(2)} W`} />
        <Row label="ELECTRÓNICA" value={`${energy.desglose_w.otros.toFixed(2)} W`} />
        <Row label="ENERGÍA HOY" value={`${(energy.energia_hoy_wh / 1000).toFixed(3)} kWh`} />
        <Row label="COSTO HOY" value={`Q${energy.costo_hoy_q.toFixed(2)}`} />
        <Row
          label="PROMEDIO 1 H"
          value={energy.promedio_1h_w === null ? "—" : `${energy.promedio_1h_w.toFixed(1)} W`}
        />
        {energy.anomalia ? (
          <Row
            label="ANOMALÍA"
            value={ANOMALY_LABEL[energy.anomalia] ?? energy.anomalia}
            tone="text-danger"
          />
        ) : null}
      </dl>

      <div className="mt-3">
        <div className="flex justify-between font-mono text-[10px] tracking-[0.1em] text-foreground-fainter">
          <span>LÍMITE DIARIO</span>
          <span className={overLimit ? "text-danger" : undefined}>
            {energy.uso_limite_pct.toFixed(0)} % DE {energy.limite_wh.toFixed(0)} Wh
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full bg-rule">
          <div
            className={`h-full ${overLimit ? "bg-danger" : usage >= 80 ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${usage}%` }}
          />
        </div>
      </div>

      {rules.length ? (
        <ul className="mt-4 font-mono text-[10px] tracking-[0.1em] text-warning">
          {rules.map(([device, rule]) => (
            <li key={device}>
              {DEVICE_LABEL[device]} {rule.enabled ? "ENCENDIDO" : "APAGADO"} ·{" "}
              {REASON_LABEL[rule.reason] ?? rule.reason.toUpperCase()}
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={saveLimit} className="mt-5 border-t border-rule pt-4">
        <div className="font-mono text-[10px] tracking-[0.1em] text-foreground-fainter">
          LÍMITE DE CONSUMO
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            aria-label="Límite diario en Wh"
            type="number"
            min={1}
            step={10}
            value={limit}
            disabled={busy}
            onChange={(event) => setLimit(event.target.value)}
            className={`${FIELD} w-24`}
          />
          <span className="font-mono text-[10px] text-foreground-muted">Wh/DÍA</span>
          <select
            aria-label="Acción al pasar el límite"
            value={limitAction}
            disabled={busy}
            onChange={(event) => setLimitAction(event.target.value as "alert" | "heater_off")}
            className={`${FIELD} flex-1`}
          >
            <option value="alert">SOLO ALERTA</option>
            <option value="heater_off">APAGAR FOCO</option>
          </select>
          <button type="submit" disabled={busy} className={BUTTON}>
            GUARDAR
          </button>
        </div>
      </form>

      <form onSubmit={startTimer} className="mt-4 border-t border-rule pt-4">
        <div className="flex justify-between font-mono text-[10px] tracking-[0.1em] text-foreground-fainter">
          <span>TEMPORIZADOR</span>
          {energy.temporizador ? (
            <span className="text-warning">
              {DEVICE_LABEL[energy.temporizador.device]}{" "}
              {energy.temporizador.state === "on" ? "ENCENDIDO" : "APAGADO"} HASTA{" "}
              {localTime(energy.temporizador.until)}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select
            aria-label="Dispositivo del temporizador"
            value={timerDevice}
            disabled={busy}
            onChange={(event) => setTimerDevice(event.target.value as EnergyDevice)}
            className={FIELD}
          >
            <option value="fan">VENTILADOR</option>
            <option value="heater">FOCO</option>
          </select>
          <select
            aria-label="Estado durante el temporizador"
            value={timerState}
            disabled={busy}
            onChange={(event) => setTimerState(event.target.value as "on" | "off")}
            className={FIELD}
          >
            <option value="on">ENCENDER</option>
            <option value="off">APAGAR</option>
          </select>
          <input
            aria-label="Minutos"
            type="number"
            min={1}
            max={1440}
            value={timerMinutes}
            disabled={busy}
            onChange={(event) => setTimerMinutes(event.target.value)}
            className={`${FIELD} w-16`}
          />
          <span className="font-mono text-[10px] text-foreground-muted">MIN</span>
          <button type="submit" disabled={busy} className={BUTTON}>
            INICIAR
          </button>
        </div>
        {energy.temporizador ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void send({ timer: null }, "Temporizador cancelado.")}
            className={`${LINK} mt-2`}
          >
            CANCELAR TEMPORIZADOR
          </button>
        ) : null}
      </form>

      <div className="mt-4 border-t border-rule pt-4">
        <div className="font-mono text-[10px] tracking-[0.1em] text-foreground-fainter">
          HORARIOS DIARIOS
        </div>
        <ul className="mt-2 font-mono text-[11px] leading-[2] tracking-[0.08em] text-foreground">
          {schedules.length === 0 ? (
            <li className="text-foreground-muted">SIN HORARIOS: CONTROL AUTOMÁTICO</li>
          ) : (
            schedules.map((schedule, index) => (
              <li key={`${schedule.device}-${schedule.start}-${index}`} className="flex justify-between">
                <span>
                  {DEVICE_LABEL[schedule.device]} {schedule.state === "on" ? "ENCENDIDO" : "APAGADO"}{" "}
                  {schedule.start}–{schedule.end}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSchedules(schedules.filter((_, i) => i !== index))}
                  className={LINK}
                >
                  QUITAR
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <select
            aria-label="Dispositivo del horario"
            value={draft.device}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, device: event.target.value as EnergyDevice })}
            className={FIELD}
          >
            <option value="fan">VENTILADOR</option>
            <option value="heater">FOCO</option>
          </select>
          <select
            aria-label="Estado en el horario"
            value={draft.state}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, state: event.target.value as "on" | "off" })}
            className={FIELD}
          >
            <option value="off">APAGADO</option>
            <option value="on">ENCENDIDO</option>
          </select>
          <input
            aria-label="Inicio"
            type="time"
            value={draft.start}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, start: event.target.value })}
            className={FIELD}
          />
          <input
            aria-label="Fin"
            type="time"
            value={draft.end}
            disabled={busy}
            onChange={(event) => setDraft({ ...draft, end: event.target.value })}
            className={FIELD}
          />
          <button type="button" disabled={busy} onClick={addSchedule} className={LINK}>
            AGREGAR
          </button>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={busy || !schedulesDirty}
            onClick={() => void saveSchedules()}
            className={BUTTON}
          >
            GUARDAR HORARIOS
          </button>
        </div>
      </div>

      <p
        aria-live="polite"
        className={`mt-3 min-h-3 font-mono text-[10px] tracking-[0.07em] ${
          message?.error ? "text-danger" : "text-success"
        }`}
      >
        {message?.text}
      </p>
      <p className="font-mono text-[9px] tracking-[0.06em] text-foreground-fainter">
        {energy.tarifa.toUpperCase()} · POTENCIA ESTIMADA
      </p>
    </section>
  );
}
