"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { DoorEvent, DoorEventType } from "@/lib/api/types";
import { useSmartEgg } from "@/lib/state/hooks";

const OPERATIONS: Array<{
  id: DoorEventType;
  label: string;
  detail: string;
  symbol: string;
}> = [
  { id: "egg_entry", label: "INGRESO", detail: "Huevos agregados", symbol: "+" },
  { id: "egg_removal", label: "RETIRO", detail: "Huevos retirados", symbol: "−" },
  { id: "inspection", label: "INSPECCIÓN", detail: "Revisión sin cambios", symbol: "◎" },
  { id: "maintenance", label: "MANTENIMIENTO", detail: "Servicio del equipo", symbol: "◇" },
];

const fieldClass =
  "mt-2 w-full border border-rule bg-background/75 px-3 py-2.5 font-mono text-[11px] text-foreground-bright outline-none transition focus:border-primary";

export function DoorOperationDialog() {
  const { technician, actions } = useSmartEgg();
  const [eventType, setEventType] = useState<DoorEventType>("inspection");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<DoorEvent | null>(null);
  const changesEggs = eventType === "egg_entry" || eventType === "egg_removal";

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) actions.closeDoorOperation();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [actions, pending]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await actions.createDoorEvent({
        event_type: eventType,
        eggs_added: eventType === "egg_entry" ? quantity : 0,
        eggs_removed: eventType === "egg_removal" ? quantity : 0,
        notes: notes.trim() || null,
      });
      setPrepared(created);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(
        message === "The incubator already has an open door event"
          ? "Ya existe una operación de puerta pendiente de cierre."
          : message || "No fue posible preparar la operación.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--scrim)] px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          actions.closeDoorOperation();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="door-operation-title"
        className="relative max-h-full w-full max-w-[650px] overflow-y-auto border border-primary/30 bg-panel px-6 py-7 shadow-[var(--panel-shadow)] console:px-9 console:py-8"
      >
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="font-mono text-[8px] tracking-[0.28em] text-primary">
              CONTROL DE ACCESO · {technician?.role.replace("_", " ").toUpperCase()}
            </div>
            <h2
              id="door-operation-title"
              className="mt-2 text-[24px] font-light tracking-[0.08em] text-foreground-bright"
            >
              OPERACIÓN DE PUERTA
            </h2>
            <p className="mt-2 max-w-[510px] text-xs leading-5 text-foreground-muted">
              Define el movimiento antes de abrir. El sensor registrará el cierre y
              finalizará tu sesión automáticamente.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar formulario"
            disabled={pending}
            onClick={actions.closeDoorOperation}
            className="px-2 py-1 font-mono text-sm text-foreground-faint transition hover:text-foreground-bright"
          >
            ×
          </button>
        </div>

        {prepared ? (
          <div className="mt-8 border border-success/35 bg-success/[0.06] px-5 py-6">
            <div className="font-mono text-[9px] tracking-[0.24em] text-success">
              OPERACIÓN #{prepared.id} PREPARADA
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground-muted">
              El registro quedó ligado a {technician?.full_name}. Ya puedes abrir la
              puerta; al cerrarla, el servo bloqueará y el dashboard terminará la sesión.
            </p>
            <button
              type="button"
              onClick={actions.closeDoorOperation}
              className="mt-6 w-full border border-success/50 bg-success/10 px-4 py-3 font-mono text-[9px] tracking-[0.24em] text-success transition hover:bg-success/20"
            >
              LISTO · ABRIR PUERTA
            </button>
          </div>
        ) : (
          <form className="mt-7" onSubmit={submit}>
            <fieldset>
              <legend className="font-mono text-[8px] tracking-[0.22em] text-foreground-faint">
                TIPO DE OPERACIÓN
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {OPERATIONS.map((operation) => (
                  <button
                    key={operation.id}
                    type="button"
                    aria-pressed={eventType === operation.id}
                    onClick={() => setEventType(operation.id)}
                    className={`flex items-center gap-3 border px-3 py-3 text-left transition ${
                      eventType === operation.id
                        ? "border-primary/60 bg-primary/15 text-primary-soft"
                        : "border-rule bg-background/35 text-foreground-muted hover:border-frame"
                    }`}
                  >
                    <span className="font-mono text-lg">{operation.symbol}</span>
                    <span>
                      <span className="block font-mono text-[9px] tracking-[0.16em]">
                        {operation.label}
                      </span>
                      <span className="mt-1 block text-[10px] text-foreground-faint">
                        {operation.detail}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            {changesEggs ? (
              <label className="mt-5 block font-mono text-[8px] tracking-[0.2em] text-foreground-faint">
                CANTIDAD DE HUEVOS
                <input
                  type="number"
                  min={1}
                  max={1000}
                  required
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  className={fieldClass}
                />
              </label>
            ) : null}

            <label className="mt-5 block font-mono text-[8px] tracking-[0.2em] text-foreground-faint">
              OBSERVACIONES
              <textarea
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="OPCIONAL"
                className={`${fieldClass} resize-none`}
              />
            </label>

            {error ? (
              <p className="mt-4 border-l-2 border-danger/50 bg-danger/[0.07] px-3.5 py-2.5 text-xs text-danger-soft">
                {error}
              </p>
            ) : null}

            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={actions.closeDoorOperation}
                className="border border-frame px-4 py-3 font-mono text-[9px] tracking-[0.18em] text-foreground-muted transition hover:text-foreground"
              >
                CANCELAR
              </button>
              <button
                type="submit"
                disabled={pending || (changesEggs && quantity < 1)}
                className="border border-primary/60 bg-primary/15 px-5 py-3 font-mono text-[9px] tracking-[0.2em] text-primary-soft transition hover:bg-primary/25 disabled:opacity-50"
              >
                {pending ? "REGISTRANDO…" : "PREPARAR APERTURA"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
