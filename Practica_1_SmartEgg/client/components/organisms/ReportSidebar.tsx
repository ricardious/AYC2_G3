import { GhostButton } from "@/components/atoms/GhostButton";
import { SectionKicker } from "@/components/atoms/SectionKicker";

/** Descripción y controles de exportación junto a la lámina del reporte. */
export function ReportSidebar() {
  return (
    <div className="w-[340px]">
      <SectionKicker>DOCUMENTO GENERADO</SectionKicker>
      <p className="mt-4 max-w-[300px] text-[15px] leading-[1.7] text-pretty text-foreground-muted">
        Resumen del ciclo activo con telemetría consolidada, eventos de rotación
        y desviaciones detectadas.
      </p>
      <GhostButton tone="primary" className="mt-7">
        GENERAR PDF
      </GhostButton>
      <div className="mt-[34px] font-mono text-[8px] leading-[2.2] tracking-[0.16em] text-foreground-faint">
        <div>FORMATO · A4 · 4 PÁGINAS</div>
        <div>INCLUYE · TELEMETRÍA · EVENTOS</div>
        <div>FIRMA DIGITAL · NODO 01</div>
      </div>
    </div>
  );
}
