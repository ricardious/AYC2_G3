import { ReportSheet } from "@/components/organisms/ReportSheet";
import { ReportSidebar } from "@/components/organisms/ReportSidebar";
import { StageBlock } from "@/components/templates/StageBlock";

/**
 * Documentación del ciclo: la lámina generada y sus controles de exportación.
 *
 * Los dos anclajes son centrales para que el sobrante vaya a los lados y no
 * entre la lámina y su barra, que forman un bloque.
 */
export function ReportsScreen() {
  return (
    <>
      <StageBlock top={190} x={420} anchor="center" wide fluid>
        <ReportSheet />
      </StageBlock>
      <StageBlock top={300} x={1090} anchor="center" fluid>
        <ReportSidebar />
      </StageBlock>
    </>
  );
}
