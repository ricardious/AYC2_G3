"use client";

import { useState } from "react";

import { GhostButton } from "@/components/atoms/GhostButton";
import { SectionKicker } from "@/components/atoms/SectionKicker";
import { useSmartEgg } from "@/lib/state/hooks";

/** Descripción y controles de exportación junto a la lámina del reporte. */
export function ReportSidebar() {
  const { technician, technicians, actions } = useSmartEgg();
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [operatorId, setOperatorId] = useState("");

  const generatePdf = async () => {
    setDownloading(true);
    setMessage(null);
    setFailed(false);
    try {
      const filename = await actions.downloadDailyReport(
        undefined,
        operatorId ? Number(operatorId) : undefined,
      );
      setMessage(`${filename} descargado`);
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo generar el reporte PDF",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="w-full max-w-[340px] console:w-[340px]">
      <SectionKicker>DOCUMENTO GENERADO</SectionKicker>
      <p className="mt-4 max-w-[300px] text-[15px] leading-[1.7] text-pretty text-foreground-muted">
        Resumen del ciclo activo con telemetría consolidada, eventos de rotación
        y desviaciones detectadas.
      </p>
      {technician?.role === "admin" ? (
        <label className="mt-5 block font-mono text-[10px] tracking-[0.12em] text-foreground-faint">
          ALCANCE DEL INFORME
          <select
            value={operatorId}
            onChange={(event) => setOperatorId(event.target.value)}
            className="mt-2 w-full border border-frame-soft bg-background px-3 py-2 text-[11px] text-foreground outline-none"
          >
            <option value="">Vista general</option>
            {technicians
              .filter((item) => item.role !== "admin")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <GhostButton
        tone="primary"
        className="mt-7 disabled:cursor-wait disabled:opacity-50"
        disabled={downloading}
        aria-busy={downloading}
        onClick={() => void generatePdf()}
      >
        {downloading ? "GENERANDO…" : "GENERAR PDF"}
      </GhostButton>
      {message ? (
        <p
          role={failed ? "alert" : "status"}
          className={`mt-3 font-mono text-[11px] leading-4 tracking-[0.09em] ${failed ? "text-danger-soft" : "text-success"}`}
        >
          {message.toUpperCase()}
        </p>
      ) : null}
      <div className="mt-[34px] font-mono text-[11px] leading-[2.2] tracking-[0.12em] text-foreground-faint">
        <div>FORMATO · PDF · A4</div>
        <div>INCLUYE · TELEMETRÍA · EVENTOS</div>
        <div>TÉCNICO AUTENTICADO · NODO 01</div>
      </div>
    </div>
  );
}
