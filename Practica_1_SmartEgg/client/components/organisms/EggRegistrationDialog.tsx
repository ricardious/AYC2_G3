"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { GhostButton } from "@/components/atoms/GhostButton";
import { useEggViews, useSmartEgg } from "@/lib/state/hooks";

function localDateTime(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function today(): string {
  return localDateTime().slice(0, 10);
}

function registrationError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : "";
  const knownErrors: Record<string, string> = {
    "Egg code already exists": "Ya existe un huevo con ese código rotulado.",
    "Lot code already exists": "Ya existe un lote con ese código.",
    "Incubator slot is already occupied":
      "La posición ya tiene una ficha activa en la base de datos.",
    "Incubator has no available slots":
      "La incubadora no tiene espacios disponibles.",
    "Eggs can only be added to an active lot":
      "Solo se pueden registrar huevos en un lote activo.",
    "Lot not found": "El lote seleccionado ya no existe.",
  };
  return knownErrors[message] ?? message ?? "No fue posible registrar el huevo.";
}

const FIELD_CLASS =
  "mt-2 w-full box-border border border-rule bg-background/75 px-3 py-2.5 font-mono text-[11px] tracking-[0.08em] text-foreground-bright outline-none transition-colors placeholder:text-foreground-fainter focus:border-primary";

const LABEL_CLASS =
  "block font-mono text-[8px] tracking-[0.2em] text-foreground-faint";

export function EggRegistrationDialog({ slot }: { slot: number }) {
  const { incubator, lots, actions } = useSmartEgg();
  const eggViews = useEggViews();
  const currentSlot = eggViews.find((egg) => egg.id === `slot-${slot}`);
  const [code, setCode] = useState("");
  const [lotChoice, setLotChoice] = useState(() =>
    lots[0] ? String(lots[0].id) : "new",
  );
  const [registeredAt, setRegisteredAt] = useState(localDateTime);
  const [notes, setNotes] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [species, setSpecies] = useState("Gallina");
  const [startedOn, setStartedOn] = useState(today);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slotLabel = String(slot).padStart(2, "0");
  const maxDateTime = useMemo(() => localDateTime(), []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) actions.closeEggRegistration();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [actions, pending]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!incubator) {
      setError("No hay una incubadora activa para registrar el huevo.");
      return;
    }
    if (!currentSlot || currentSlot.empty) {
      setError("El Arduino ya no detecta un huevo en esta posición.");
      return;
    }
    if (currentSlot.registered) {
      setError("Esta posición ya tiene una ficha registrada.");
      return;
    }
    if (!code.trim()) {
      setError("Ingrese el código rotulado del huevo.");
      return;
    }
    if (code.trim().length > 50) {
      setError("El código del huevo no puede superar 50 caracteres.");
      return;
    }

    const entryDate = new Date(registeredAt);
    if (Number.isNaN(entryDate.getTime()) || entryDate > new Date()) {
      setError("La fecha de ingreso debe ser válida y no puede estar en el futuro.");
      return;
    }
    if (lotChoice === "new" && !lotCode.trim()) {
      setError("Ingrese el código del nuevo lote.");
      return;
    }
    if (lotChoice === "new" && species.trim().length < 2) {
      setError("La especie del lote debe tener al menos 2 caracteres.");
      return;
    }
    const lotStartDate = new Date(`${startedOn}T00:00:00`);
    if (
      lotChoice === "new" &&
      (Number.isNaN(lotStartDate.getTime()) || lotStartDate > new Date())
    ) {
      setError("La fecha de inicio del lote debe ser válida y no futura.");
      return;
    }
    if (
      lotChoice !== "new" &&
      !lots.some((lot) => lot.id === Number(lotChoice))
    ) {
      setError("Seleccione un lote activo válido.");
      return;
    }

    setPending(true);
    try {
      let lotId = Number(lotChoice);
      if (lotChoice === "new") {
        const createdLot = await actions.createLot({
          code: lotCode.trim(),
          species: species.trim(),
          started_on: startedOn,
        });
        lotId = createdLot.id;
        setLotChoice(String(createdLot.id));
      }

      await actions.registerEgg({
        code: code.trim(),
        lot_id: lotId,
        incubator_id: incubator.id,
        slot_number: slot,
        registered_at: entryDate.toISOString(),
        notes: notes.trim() || null,
      });
      actions.closeEggRegistration();
    } catch (reason) {
      setError(registrationError(reason));
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          actions.closeEggRegistration();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="egg-registration-title"
        className="relative max-h-full w-full max-w-[680px] overflow-y-auto border border-primary/30 bg-panel px-6 py-7 shadow-[0_30px_100px_rgba(0,0,0,.75)] console:px-9 console:py-8"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
        />

        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="font-mono text-[8px] tracking-[0.28em] text-primary">
              FICHA DE IDENTIFICACIÓN · POSICIÓN {slotLabel}
            </div>
            <h2
              id="egg-registration-title"
              className="mt-2 text-[24px] font-light tracking-[0.08em] text-foreground-bright"
            >
              REGISTRAR HUEVO
            </h2>
            <p className="mt-2 max-w-[520px] font-mono text-[9px] leading-5 tracking-[0.08em] text-foreground-faint">
              El sensor confirma ocupación física. Complete el rótulo y el
              ingreso para conservar la ficha en el historial del lote.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar formulario"
            disabled={pending}
            onClick={actions.closeEggRegistration}
            className="px-2 py-1 font-mono text-sm text-foreground-faint transition-colors hover:text-foreground-bright disabled:opacity-40"
          >
            ×
          </button>
        </div>

        <form className="mt-7" onSubmit={submit} noValidate>
          <div className="grid gap-5 console:grid-cols-2">
            <label className={LABEL_CLASS}>
              CÓDIGO ROTULADO <span className="text-danger">*</span>
              <input
                autoFocus
                required
                maxLength={50}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="EJ. H-2026-001"
                className={FIELD_CLASS}
              />
            </label>

            <label className={LABEL_CLASS}>
              POSICIÓN FÍSICA
              <input
                readOnly
                value={`POSICIÓN ${slotLabel}`}
                className={`${FIELD_CLASS} text-primary`}
              />
            </label>

            <label className={LABEL_CLASS}>
              LOTE ACTIVO <span className="text-danger">*</span>
              <select
                required
                value={lotChoice}
                onChange={(event) => setLotChoice(event.target.value)}
                className={FIELD_CLASS}
              >
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.code} · {lot.species}
                  </option>
                ))}
                <option value="new">+ CREAR NUEVO LOTE</option>
              </select>
            </label>

            <label className={LABEL_CLASS}>
              FECHA Y HORA DE INGRESO <span className="text-danger">*</span>
              <input
                required
                type="datetime-local"
                max={maxDateTime}
                value={registeredAt}
                onChange={(event) => setRegisteredAt(event.target.value)}
                className={FIELD_CLASS}
              />
            </label>
          </div>

          {lotChoice === "new" ? (
            <fieldset className="mt-6 border border-dashed border-rule px-4 py-4">
              <legend className="px-2 font-mono text-[8px] tracking-[0.2em] text-warning">
                NUEVO LOTE
              </legend>
              <div className="grid gap-5 console:grid-cols-3">
                <label className={LABEL_CLASS}>
                  CÓDIGO <span className="text-danger">*</span>
                  <input
                    required
                    maxLength={50}
                    value={lotCode}
                    onChange={(event) => setLotCode(event.target.value)}
                    placeholder="LOTE-A"
                    className={FIELD_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  ESPECIE <span className="text-danger">*</span>
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    value={species}
                    onChange={(event) => setSpecies(event.target.value)}
                    className={FIELD_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  INICIO <span className="text-danger">*</span>
                  <input
                    required
                    type="date"
                    max={today()}
                    value={startedOn}
                    onChange={(event) => setStartedOn(event.target.value)}
                    className={FIELD_CLASS}
                  />
                </label>
              </div>
            </fieldset>
          ) : null}

          <label className={`${LABEL_CLASS} mt-5`}>
            OBSERVACIONES
            <textarea
              maxLength={1000}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Origen, estado del cascarón u observaciones del ingreso"
              className={`${FIELD_CLASS} resize-none leading-5`}
            />
          </label>

          {error ? (
            <div
              role="alert"
              className="mt-5 border-l-2 border-danger bg-danger/8 px-4 py-3 font-mono text-[9px] leading-5 tracking-[0.08em] text-danger-soft"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-5">
            <div className="font-mono text-[8px] tracking-[0.16em] text-foreground-fainter">
              SENSOR · DETECTADO&nbsp;&nbsp; BASE DE DATOS · PENDIENTE
            </div>
            <div className="flex gap-3">
              <GhostButton
                type="button"
                disabled={pending}
                onClick={actions.closeEggRegistration}
              >
                CANCELAR
              </GhostButton>
              <GhostButton type="submit" disabled={pending}>
                {pending ? "GUARDANDO…" : "GUARDAR FICHA"}
              </GhostButton>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
