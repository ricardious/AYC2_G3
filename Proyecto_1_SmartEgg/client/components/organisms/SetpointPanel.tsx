"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { SetpointSlider } from "@/components/molecules/SetpointSlider";
import type {
  IncubatorConfig,
  IncubatorConfigUpdate,
} from "@/lib/api/types";
import { useSmartEgg } from "@/lib/state/hooks";
import { DANGER, PRIMARY, WARNING } from "@/lib/smartegg/theme";

interface DraftConfig {
  temperatureTarget: number;
  temperatureTolerance: number;
  humidityTarget: number;
  humidityTolerance: number;
  rotationMinutes: number;
  rotationAngle: number;
  criticalTemperature: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function rounded(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function draftFrom(config: IncubatorConfig): DraftConfig {
  return {
    temperatureTarget: rounded(
      (config.temperature_min_c + config.temperature_max_c) / 2,
    ),
    temperatureTolerance: rounded(
      (config.temperature_max_c - config.temperature_min_c) / 2,
    ),
    humidityTarget: rounded(
      (config.humidity_min_pct + config.humidity_max_pct) / 2,
    ),
    humidityTolerance: rounded(
      (config.humidity_max_pct - config.humidity_min_pct) / 2,
    ),
    rotationMinutes: rounded(config.rotation_interval_seconds / 60, 2),
    rotationAngle: config.rotation_angle_degrees,
    criticalTemperature: config.critical_temperature_c,
  };
}

function payloadFrom(draft: DraftConfig): IncubatorConfigUpdate {
  return {
    temperature_min_c: rounded(
      draft.temperatureTarget - draft.temperatureTolerance,
    ),
    temperature_max_c: rounded(
      draft.temperatureTarget + draft.temperatureTolerance,
    ),
    humidity_min_pct: rounded(
      draft.humidityTarget - draft.humidityTolerance,
    ),
    humidity_max_pct: rounded(
      draft.humidityTarget + draft.humidityTolerance,
    ),
    critical_temperature_c: rounded(draft.criticalTemperature),
    rotation_interval_seconds: Math.round(draft.rotationMinutes * 60),
    rotation_angle_degrees: Math.round(draft.rotationAngle),
  };
}

function validationError(draft: DraftConfig): string | null {
  const payload = payloadFrom(draft);
  if (draft.temperatureTolerance <= 0) {
    return "La tolerancia de temperatura debe ser mayor que cero.";
  }
  if (payload.temperature_min_c < -20 || payload.temperature_max_c > 80) {
    return "El rango de temperatura queda fuera de los límites permitidos.";
  }
  if (draft.humidityTolerance <= 0) {
    return "La tolerancia de humedad debe ser mayor que cero.";
  }
  if (payload.humidity_min_pct < 0 || payload.humidity_max_pct > 100) {
    return "El rango de humedad debe permanecer entre 0 % y 100 %.";
  }
  if (payload.critical_temperature_c <= payload.temperature_max_c) {
    return "La alarma debe superar el máximo de temperatura permitido.";
  }
  if (payload.rotation_interval_seconds < 10) {
    return "El intervalo de rotación debe ser de al menos 10 segundos.";
  }
  if (payload.rotation_angle_degrees < 1 || payload.rotation_angle_degrees > 90) {
    return "El ángulo debe estar entre 1° y 90°.";
  }
  return null;
}

export function SetpointPanel() {
  const { dashboard, actions } = useSmartEgg();
  const config = dashboard?.config ?? null;
  const [draft, setDraft] = useState<DraftConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const loadedRevision = useRef<string | null>(null);

  useEffect(() => {
    if (!config || loadedRevision.current === config.updated_at) return;
    loadedRevision.current = config.updated_at;
    setDraft(draftFrom(config));
    setDirty(false);
  }, [config]);

  const change = <K extends keyof DraftConfig>(
    key: K,
    value: DraftConfig[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
    setSaveState("idle");
    setMessage(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    const invalid = validationError(draft);
    if (invalid) {
      setSaveState("error");
      setMessage(invalid);
      return;
    }
    setSaveState("saving");
    setMessage("Guardando parámetros de control…");
    try {
      await actions.updateIncubatorConfig(payloadFrom(draft));
      setDirty(false);
      setSaveState("saved");
      setMessage("Configuración guardada correctamente.");
    } catch (error) {
      setSaveState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la configuración.",
      );
    }
  };

  const reset = () => {
    if (!config) return;
    setDraft(draftFrom(config));
    setDirty(false);
    setSaveState("idle");
    setMessage(null);
  };

  const busy = saveState === "saving";

  return (
    <section
      aria-label="Calibración de setpoints"
      className="w-full max-w-[420px] console:w-[420px]"
    >
      <div className="flex items-end justify-between">
        <SectionKicker>CALIBRACIÓN DE SETPOINTS</SectionKicker>
        <span className="font-mono text-[10px] tracking-[0.1em] text-foreground-fainter">
          {config ? "DATOS DEL NODO" : "ESPERANDO NODO"}
        </span>
      </div>

      {!draft ? (
        <div className="mt-7 border-l border-primary/40 py-5 pl-4 font-mono text-[11px] tracking-[0.1em] text-foreground-muted">
          CARGANDO PARÁMETROS DE CONTROL…
        </div>
      ) : (
        <form onSubmit={save} className="mt-6">
          <div className="flex flex-col gap-[22px]">
            <SetpointSlider
              label="TEMPERATURA OBJETIVO"
              value={draft.temperatureTarget}
              suffix="°C"
              min={30}
              max={42}
              step={0.1}
              color={WARNING}
              disabled={busy}
              onChange={(value) => change("temperatureTarget", value)}
              secondary={{
                label: "TOLERANCIA ±",
                value: draft.temperatureTolerance,
                suffix: "°C",
                min: 0.1,
                max: 5,
                step: 0.1,
                onChange: (value) => change("temperatureTolerance", value),
              }}
            />
            <SetpointSlider
              label="HUMEDAD OBJETIVO"
              value={draft.humidityTarget}
              suffix="%"
              min={20}
              max={90}
              step={0.5}
              color={PRIMARY}
              disabled={busy}
              onChange={(value) => change("humidityTarget", value)}
              secondary={{
                label: "TOLERANCIA ±",
                value: draft.humidityTolerance,
                suffix: "%",
                min: 0.5,
                max: 30,
                step: 0.5,
                onChange: (value) => change("humidityTolerance", value),
              }}
            />
            <SetpointSlider
              label="INTERVALO DE ROTACIÓN"
              value={draft.rotationMinutes}
              suffix="MIN"
              min={1}
              max={1440}
              step={1}
              color={PRIMARY}
              disabled={busy}
              onChange={(value) => change("rotationMinutes", value)}
              secondary={{
                label: "ÁNGULO ±",
                value: draft.rotationAngle,
                suffix: "°",
                min: 1,
                max: 90,
                step: 1,
                onChange: (value) => change("rotationAngle", value),
              }}
            />
            <SetpointSlider
              label="UMBRAL DE ALARMA"
              value={draft.criticalTemperature}
              suffix="°C"
              min={35}
              max={50}
              step={0.1}
              color={DANGER}
              hint="BUZZER + CORTE DE CALEFACCIÓN"
              disabled={busy}
              onChange={(value) => change("criticalTemperature", value)}
            />
          </div>

          <div className="mt-6 border-t border-rule pt-4">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={!dirty || busy}
                onClick={reset}
                className="font-mono text-[10px] tracking-[0.1em] text-foreground-fainter transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                RESTABLECER
              </button>
              <button
                type="submit"
                disabled={!dirty || busy}
                className="border border-primary/60 bg-primary/8 px-5 py-2.5 font-mono text-[11px] tracking-[0.12em] text-primary transition-[background-color,box-shadow,color] hover:bg-primary/15 hover:shadow-[0_0_18px_color-mix(in_srgb,var(--color-primary)_20%,transparent)] disabled:cursor-not-allowed disabled:border-rule disabled:bg-transparent disabled:text-foreground-fainter disabled:shadow-none"
              >
                {busy ? "SINCRONIZANDO…" : "GUARDAR CAMBIOS"}
              </button>
            </div>
            <p
              aria-live="polite"
              className={`mt-3 min-h-3 font-mono text-[10px] tracking-[0.07em] ${
                saveState === "error"
                  ? "text-danger"
                  : saveState === "saved"
                    ? "text-success"
                    : "text-foreground-fainter"
              }`}
            >
              {message}
            </p>
          </div>
        </form>
      )}
    </section>
  );
}
