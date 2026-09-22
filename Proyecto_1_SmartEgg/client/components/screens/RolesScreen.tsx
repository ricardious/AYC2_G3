"use client";

import { useState, type FormEvent } from "react";

import { StageBlock } from "@/components/templates/StageBlock";
import type { TechnicianCreate } from "@/lib/api/types";
import { useSmartEgg } from "@/lib/state/hooks";

const fieldClass =
  "border border-frame-soft bg-background/60 px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-primary/70";

function metric(value: number | null, suffix = ""): string {
  return value === null ? "SIN DATOS" : `${value.toFixed(1)}${suffix}`;
}

export function RolesScreen() {
  const {
    technician,
    incubator,
    diagnostic,
    technicians,
    reportExports,
    adminExists,
    actions,
  } = useSmartEgg();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<TechnicianCreate>({
    username: "",
    full_name: "",
    role: "operator_1",
    password: "",
    rfid_uid: "",
  });
  const isAdmin = technician?.role === "admin";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      await actions.createTechnician(
        {
          ...form,
          role: isAdmin ? form.role : "admin",
          rfid_uid: form.rfid_uid || null,
        },
        incubator ? [incubator.id] : [],
      );
      setForm({
        username: "",
        full_name: "",
        role: "operator_1",
        password: "",
        rfid_uid: "",
      });
      setMessage(
        isAdmin
          ? "Perfil creado y asignado correctamente."
          : "Administrador recuperado. Cierra sesión e ingresa con la cuenta nueva.",
      );
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No se pudo crear el perfil");
    } finally {
      setPending(false);
    }
  };

  return (
    <StageBlock top={155} x={205} anchor="left" wide fluid>
      <section className="w-[1320px] max-w-full space-y-6 px-8 pb-12 text-foreground">
        <header className="border-b border-divider pb-5">
          <p className="kicker text-primary">
            {isAdmin ? "ADMINISTRACIÓN DE ACCESO" : "PERFIL DEL OPERADOR"}
          </p>
          <h2 className="mt-3 text-2xl font-light tracking-[0.12em] text-foreground-bright">
            {technician?.full_name.toUpperCase()}
          </h2>
          <p className="mt-2 font-mono text-[11px] tracking-[0.14em] text-foreground-muted">
            {technician?.role.replace("_", " ").toUpperCase()}
          </p>
        </header>

        {diagnostic ? (
          <div className="grid grid-cols-2 gap-px border border-divider bg-divider md:grid-cols-4">
            {[
              ["MUESTRAS", String(diagnostic.telemetry_samples)],
              ["TEMP. PROM.", metric(diagnostic.temperature_avg_c, " °C")],
              ["HUM. PROM.", metric(diagnostic.humidity_avg_pct, " %")],
              ["APERTURAS", String(diagnostic.door_events)],
              ["HUEVOS INGRESADOS", String(diagnostic.eggs_added)],
              ["HUEVOS RETIRADOS", String(diagnostic.eggs_removed)],
              ["ALARMAS ATENDIDAS", String(diagnostic.acknowledged_alarms)],
              ["INFORMES", String(diagnostic.generated_reports)],
            ].map(([label, value]) => (
              <div key={label} className="bg-panel px-5 py-4">
                <div className="font-mono text-[10px] tracking-[0.15em] text-foreground-fainter">
                  {label}
                </div>
                <div className="mt-2 text-lg text-foreground-bright">{value}</div>
              </div>
            ))}
          </div>
        ) : null}

        {!isAdmin && !adminExists ? (
          <form onSubmit={submit} className="border border-warning/50 bg-panel/70 p-5">
            <h3 className="font-mono text-[12px] tracking-[0.16em] text-warning">
              RECUPERAR ADMINISTRADOR
            </h3>
            <p className="mt-2 text-xs text-foreground-muted">
              Esta instalación todavía no tiene administrador. Crea la única cuenta
              inicial y luego vuelve a iniciar sesión con ella.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <input
                required
                placeholder="Nombre completo"
                className={fieldClass}
                value={form.full_name}
                onChange={(event) => setForm({ ...form, full_name: event.target.value })}
              />
              <input
                required
                placeholder="Usuario administrador"
                className={fieldClass}
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
              />
              <input
                required
                type="password"
                minLength={8}
                placeholder="Contraseña (mínimo 8 caracteres)"
                className={fieldClass}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="mt-3 border border-warning/60 px-4 py-3 font-mono text-[11px] tracking-[0.16em] text-warning disabled:opacity-50"
            >
              {pending ? "CREANDO…" : "CREAR ADMINISTRADOR"}
            </button>
            {message ? <p className="mt-3 text-xs text-foreground-muted">{message}</p> : null}
          </form>
        ) : null}

        {isAdmin ? (
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="border border-frame-soft bg-panel/70 p-5">
              <h3 className="font-mono text-[12px] tracking-[0.16em] text-primary">
                OPERADORES REGISTRADOS
              </h3>
              <div className="mt-4 space-y-2">
                {technicians.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 border border-divider bg-background/35 p-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center"
                  >
                    <button
                      type="button"
                      onClick={() => void actions.refreshRoleData(item.id)}
                      className="text-left"
                    >
                      <span className="block text-sm text-foreground-bright">
                        {item.full_name}
                      </span>
                      <span className="font-mono text-[10px] tracking-[0.12em] text-foreground-muted">
                        {item.role.replace("_", " ")} · {item.username}
                      </span>
                    </button>
                    <span className="font-mono text-[10px] text-foreground-muted">
                      {item.incubator_ids.length
                        ? `NODOS ${item.incubator_ids.join(", ")}`
                        : item.role === "admin"
                          ? "ACCESO GLOBAL"
                          : "SIN ASIGNAR"}
                    </span>
                    {item.role !== "admin" && incubator ? (
                      <button
                        type="button"
                        onClick={() => {
                          const assigned = item.incubator_ids.includes(incubator.id);
                          void actions.assignTechnician(
                            item.id,
                            assigned
                              ? item.incubator_ids.filter((id) => id !== incubator.id)
                              : [...item.incubator_ids, incubator.id],
                          );
                        }}
                        className="border border-frame-soft px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-foreground-muted"
                      >
                        {item.incubator_ids.includes(incubator.id)
                          ? "QUITAR NODO"
                          : "ASIGNAR NODO"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={item.id === technician?.id}
                      onClick={() =>
                        void actions.setTechnicianActive(item.id, !item.is_active)
                      }
                      className="border border-frame-soft px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-foreground-muted disabled:opacity-30"
                    >
                      {item.is_active ? "DESACTIVAR" : "ACTIVAR"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={submit} className="border border-frame-soft bg-panel/70 p-5">
              <h3 className="font-mono text-[12px] tracking-[0.16em] text-primary">
                NUEVO PERFIL
              </h3>
              <div className="mt-4 grid gap-3">
                <input
                  required
                  placeholder="Nombre completo"
                  className={fieldClass}
                  value={form.full_name}
                  onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                />
                <input
                  required
                  placeholder="Usuario"
                  className={fieldClass}
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                />
                <input
                  required
                  type="password"
                  minLength={8}
                  placeholder="Contraseña (mínimo 8 caracteres)"
                  className={fieldClass}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
                <input
                  placeholder="UID RFID opcional"
                  className={fieldClass}
                  value={form.rfid_uid ?? ""}
                  onChange={(event) => setForm({ ...form, rfid_uid: event.target.value })}
                />
                <select
                  className={fieldClass}
                  value={form.role}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      role: event.target.value as TechnicianCreate["role"],
                    })
                  }
                >
                  <option value="operator_1">Operador 1</option>
                  <option value="operator_2">Operador 2</option>
                  <option value="admin">Administrador</option>
                </select>
                <button
                  type="submit"
                  disabled={pending}
                  className="border border-primary/60 bg-primary/10 px-4 py-3 font-mono text-[11px] tracking-[0.16em] text-primary disabled:opacity-50"
                >
                  {pending ? "CREANDO…" : "CREAR PERFIL"}
                </button>
                {message ? <p className="text-xs text-foreground-muted">{message}</p> : null}
              </div>
            </form>
          </div>
        ) : null}

        <div className="border border-frame-soft bg-panel/70 p-5">
          <h3 className="font-mono text-[12px] tracking-[0.16em] text-primary">
            INFORMES GENERADOS
          </h3>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {reportExports.length ? (
              reportExports.slice(0, 8).map((report) => (
                <div key={report.id} className="border border-divider p-3 text-xs">
                  <span className="text-foreground-bright">{report.report_day}</span>
                  <span className="ml-3 font-mono text-[10px] uppercase text-foreground-muted">
                    {report.scope}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-foreground-muted">Aún no hay informes exportados.</p>
            )}
          </div>
        </div>
      </section>
    </StageBlock>
  );
}
