"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { BackdropLayers } from "@/components/atoms/BackdropLayers";
import { SmartEggMark } from "@/components/atoms/SmartEggLogo";
import { StatusDot } from "@/components/atoms/StatusDot";
import { ThemeSwitcher } from "@/components/molecules/ThemeSwitcher";
import { apiOrigin } from "@/lib/api/client";
import { useSmartEgg } from "@/lib/state/hooks";

/** Espécimen sobre su anillo orbital de escaneo — la firma visual del acceso. */
function EggEmblem() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto flex h-24 w-24 items-center justify-center"
    >
      <div className="absolute inset-0 animate-sweep rounded-full border border-dashed border-primary/30" />
      <div className="absolute inset-[10px] rounded-full border border-primary/10" />
      <div className="absolute inset-5 animate-breathe rounded-full bg-primary/15 blur-lg" />
      <SmartEggMark className="relative z-10 h-14 w-12 drop-shadow-[0_0_12px_var(--accent-mark)]" />
    </div>
  );
}

/** Las cuatro esquinas del marco HUD que monta el panel. */
function CornerBrackets() {
  const base = "absolute h-4 w-4 border-primary/60";
  return (
    <>
      <span aria-hidden="true" className={`${base} -top-px -left-px border-t border-l`} />
      <span aria-hidden="true" className={`${base} -top-px -right-px border-t border-r`} />
      <span aria-hidden="true" className={`${base} -bottom-px -left-px border-b border-l`} />
      <span aria-hidden="true" className={`${base} -bottom-px -right-px border-b border-r`} />
    </>
  );
}

/** Cabecera de estado: punto de telemetría + etiqueta monoespaciada. */
function GateKicker({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <StatusDot
        size={6}
        color="var(--color-primary)"
        glow={8}
        className="animate-pulse-slow"
      />
      <span className="kicker text-primary">{children}</span>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="console-backdrop relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10 text-foreground">
      <BackdropLayers />
      <div className="absolute z-20" style={{ top: 20, right: 20 }}>
        <ThemeSwitcher />
      </div>
      <div className="relative z-10 w-full max-w-[440px]">
        <section className="relative border border-frame bg-panel/90 px-7 py-9 [box-shadow:var(--panel-shadow)] backdrop-blur-md sm:px-10">
          <CornerBrackets />
          <span
            aria-hidden="true"
            className="edge-light absolute top-0 left-1/2 h-px w-40 -translate-x-1/2"
          />
          {children}
        </section>
        <footer className="mt-5 flex items-center justify-between font-mono text-[8px] tracking-[0.2em] text-foreground-fainter">
          <span className="flex items-center gap-2">
            <StatusDot
              size={5}
              color="var(--color-success)"
              glow={6}
              className="animate-pulse-slow"
            />
            API LOCAL
          </span>
          {/* El origen depende de `window.location`: sólo existe en cliente. */}
          <span suppressHydrationWarning>{apiOrigin()}</span>
        </footer>
      </div>
    </main>
  );
}

const fieldLabelClass =
  "font-mono text-[9px] tracking-[0.24em] text-foreground-faint transition-colors group-focus-within:text-primary";

const fieldInputClass =
  "w-full border border-frame-soft bg-background/60 py-3 pr-4 pl-9 font-mono text-[13px] tracking-[0.06em] text-foreground outline-none transition focus:border-primary/70 focus:bg-background/90 focus:shadow-[0_0_0_1px_var(--accent-mark),0_0_28px_var(--accent-halo)]";

function FieldGlyph() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-mono text-[11px] text-foreground-fainter transition-colors group-focus-within:text-primary/80"
    >
      ›
    </span>
  );
}

function RfidScanner({
  status,
}: {
  status: "disabled" | "connecting" | "ready" | "authorized" | "offline";
}) {
  const copy = {
    disabled: ["RFID NO CONFIGURADO", "Acceso disponible con usuario y contraseña"],
    connecting: ["ENLAZANDO LECTOR", "Conectando con el punto de acceso local"],
    ready: ["ACERCA TU TARJETA", "RC522 listo para identificar al operador"],
    authorized: ["TARJETA AUTORIZADA", "Abriendo sesión y liberando la puerta"],
    offline: ["LECTOR SIN CONEXIÓN", "Reconectando automáticamente con el backend"],
  } as const;
  const [title, detail] = copy[status];
  const active = status === "ready" || status === "authorized";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`group relative overflow-hidden border px-4 py-4 transition duration-500 ${
        active
          ? "border-primary/50 bg-primary/[0.09] shadow-[inset_0_0_24px_var(--accent-halo)]"
          : "border-frame-soft bg-background/35"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-px bg-primary ${status === "ready" ? "animate-pulse" : "opacity-30"}`}
      />
      <div className="flex items-center gap-4">
        <div className="relative grid h-12 w-12 shrink-0 place-items-center border border-primary/30 bg-background/50 text-primary">
          {status === "ready" ? (
            <span className="absolute inset-1 animate-ping border border-primary/20" />
          ) : null}
          <svg
            aria-hidden="true"
            viewBox="0 0 32 32"
            className="relative h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          >
            <rect x="5" y="7" width="17" height="20" rx="1" />
            <path d="M9 12h9M9 16h6M25 11c2.7 2.7 2.7 7.3 0 10M22.5 13.5c1.3 1.3 1.3 3.7 0 5" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-[0.2em] text-primary-soft">
            {title}
          </div>
          <p className="mt-1.5 text-xs leading-5 text-foreground-muted">{detail}</p>
        </div>
        <StatusDot
          size={6}
          color={active ? "var(--color-success)" : "var(--color-foreground-fainter)"}
          glow={active ? 7 : 0}
          className={status === "ready" ? "animate-pulse-slow" : undefined}
        />
      </div>
    </div>
  );
}

export function ConnectionGate({ children }: { children: ReactNode }) {
  const {
    hydrated,
    technician,
    dashboard,
    error,
    loginPending,
    rfidConnection,
    accessMessage,
    actions,
  } = useSmartEgg();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (!hydrated) {
    return (
      <Shell>
        <EggEmblem />
        <div className="mt-8 text-center">
          <div className="kicker text-primary">SMART EGG · ENLACE LOCAL</div>
          <p className="mt-5 font-mono text-[11px] tracking-[0.17em] text-foreground-muted">
            VALIDANDO SESIÓN…
          </p>
          <div className="mx-auto mt-6 h-px w-32 overflow-hidden bg-divider">
            <div className="h-full w-1/2 animate-breathe bg-primary/70" />
          </div>
        </div>
      </Shell>
    );
  }

  if (!technician) {
    const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      try {
        await actions.login(username.trim(), password);
      } catch {
        // The provider exposes a translated API error below the form.
      }
    };

    return (
      <Shell>
        <EggEmblem />
        <div className="mt-8">
          <GateKicker>SMART EGG · ACCESO TÉCNICO</GateKicker>
          <h1 className="mt-4 text-[26px] font-extralight tracking-[0.14em] text-foreground-bright">
            CENTRO DE CONTROL
          </h1>
          <div aria-hidden="true" className="edge-light mt-5 h-px w-full opacity-70" />
          <p className="mt-5 max-w-[340px] text-sm leading-6 text-foreground-muted">
            Usa tu tarjeta RFID o las credenciales asignadas para abrir una sesión de
            operación.
          </p>
        </div>

        <div className="mt-7">
          <RfidScanner status={rfidConnection} />
          {accessMessage ? (
            <p className="mt-3 border-l-2 border-success/60 bg-success/[0.06] px-3.5 py-2.5 text-xs leading-5 text-success">
              {accessMessage}
            </p>
          ) : null}
        </div>

        <div className="mt-7 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-divider" />
          <span className="font-mono text-[8px] tracking-[0.24em] text-foreground-fainter">
            ACCESO MANUAL
          </span>
          <span className="h-px flex-1 bg-divider" />
        </div>

        <form className="mt-6 space-y-5" onSubmit={submit}>
          <label className="group block">
            <span className={fieldLabelClass}>USUARIO</span>
            <span className="relative mt-2 block">
              <FieldGlyph />
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={fieldInputClass}
              />
            </span>
          </label>
          <label className="group block">
            <span className={fieldLabelClass}>CONTRASEÑA</span>
            <span className="relative mt-2 block">
              <FieldGlyph />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={fieldInputClass}
              />
            </span>
          </label>

          {error ? (
            <p
              role="alert"
              className="border-l-2 border-danger/50 bg-danger/[0.07] px-3.5 py-2.5 text-xs leading-5 text-danger-soft"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loginPending}
            className="group relative w-full overflow-hidden border border-primary/60 bg-primary/15 px-5 py-3.5 font-mono text-[10px] tracking-[0.3em] text-primary-soft transition hover:border-primary hover:bg-primary/25 hover:text-foreground-bright hover:shadow-[0_0_32px_var(--accent-halo)] disabled:cursor-wait disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-primary/25 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <span className="relative">
              {loginPending ? "CONECTANDO…" : "INICIAR ENLACE"}
            </span>
          </button>
        </form>
      </Shell>
    );
  }

  if (!dashboard) {
    return (
      <Shell>
        <GateKicker>SMART EGG · SINCRONIZACIÓN</GateKicker>
        <h1 className="mt-4 text-[22px] font-extralight tracking-[0.12em] text-foreground-bright">
          {error ? "ENLACE NO DISPONIBLE" : "CARGANDO INCUBADORA"}
        </h1>
        <div aria-hidden="true" className="edge-light mt-5 h-px w-full opacity-70" />
        {error ? (
          <p
            role="alert"
            className="mt-5 border-l-2 border-danger/50 bg-danger/[0.07] px-3.5 py-2.5 text-xs leading-5 text-danger-soft"
          >
            {error}
          </p>
        ) : (
          <>
            <p className="mt-5 text-sm leading-6 text-foreground-muted">
              Consultando estado, configuración e historial reciente…
            </p>
            <div className="mt-6 h-px w-full overflow-hidden bg-divider">
              <div className="h-full w-1/2 animate-breathe bg-primary/70" />
            </div>
          </>
        )}
        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={() => void actions.refresh().catch(() => undefined)}
            className="border border-primary/50 bg-primary/10 px-5 py-2.5 font-mono text-[9px] tracking-[0.2em] text-primary-soft transition hover:bg-primary/20"
          >
            REINTENTAR
          </button>
          <button
            type="button"
            onClick={actions.logout}
            className="border border-frame px-5 py-2.5 font-mono text-[9px] tracking-[0.2em] text-foreground-muted transition hover:border-hairline hover:text-foreground"
          >
            CERRAR SESIÓN
          </button>
        </div>
      </Shell>
    );
  }

  return children;
}
