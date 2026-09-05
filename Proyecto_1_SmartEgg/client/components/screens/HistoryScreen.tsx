import { HistoryCharts } from "@/components/organisms/HistoryCharts";
import { HistoryOverview } from "@/components/organisms/HistoryOverview";
import { StageBlock } from "@/components/templates/StageBlock";

/**
 * Agregados y gráficas de las últimas lecturas disponibles del nodo.
 */
export function HistoryScreen() {
  return (
    <>
      <StageBlock top={170} x={176} fillRight wide fluid>
        <HistoryOverview />
      </StageBlock>
      <StageBlock top={300} x={176} fillRight wide fluid>
        <HistoryCharts />
      </StageBlock>
    </>
  );
}
