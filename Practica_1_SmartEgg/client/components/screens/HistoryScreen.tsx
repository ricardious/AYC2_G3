import { HistoryCharts } from "@/components/organisms/HistoryCharts";
import { HistoryOverview } from "@/components/organisms/HistoryOverview";
import { StageBlock } from "@/components/templates/StageBlock";

/**
 * Laboratorio de telemetría: agregados de 24 h, trazas y línea de tiempo.
 *
 * Las trazas son SVG con `viewBox`, así que los dos bloques se estiran y
 * aprovechan el ancho de más en vez de repartirlo en huecos.
 */
export function HistoryScreen() {
  return (
    <>
      <StageBlock top={170} x={176} fillRight wide>
        <HistoryOverview />
      </StageBlock>
      <StageBlock top={300} x={176} fillRight wide>
        <HistoryCharts />
      </StageBlock>
    </>
  );
}
