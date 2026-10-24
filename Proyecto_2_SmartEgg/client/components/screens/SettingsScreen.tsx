import { EnergyPanel } from "@/components/organisms/EnergyPanel";
import { NodePanel } from "@/components/organisms/NodePanel";
import { SetpointPanel } from "@/components/organisms/SetpointPanel";
import { StageBlock } from "@/components/templates/StageBlock";

/**
 * Parámetros del nodo: setpoints de los lazos de control, datos de firmware y
 * consumo eléctrico con sus reglas.
 *
 * Los paneles se anclan por separado, no en una fila flexible, para que el
 * ancho sobrante se abra entre ellos. Sin sobrante caen en 176 y 686.
 */
export function SettingsScreen() {
  return (
    <>
      <StageBlock top={190} x={176} wide fluid>
        <SetpointPanel />
      </StageBlock>
      <StageBlock top={190} x={686} anchor="right" fluid>
        <NodePanel />
      </StageBlock>
      <StageBlock top={190} x={1106} anchor="right" fillRight fluid>
        <EnergyPanel />
      </StageBlock>
    </>
  );
}
