import { SpecimenStation } from "@/components/organisms/SpecimenStation";
import { StationSummary } from "@/components/organisms/StationSummary";
import { StageBlock } from "@/components/templates/StageBlock";

/** Mesa de análisis: cada espécimen del lote a tamaño completo. */
export function IncubationScreen() {
  return (
    <>
      <StageBlock top={200} x={176}>
        <StationSummary />
      </StageBlock>
      <StageBlock top={190} x={260} anchor="center" wide fluid>
        <SpecimenStation />
      </StageBlock>
    </>
  );
}
