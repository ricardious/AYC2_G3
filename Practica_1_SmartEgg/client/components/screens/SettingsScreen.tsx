import { NodePanel } from "@/components/organisms/NodePanel";
import { SetpointPanel } from "@/components/organisms/SetpointPanel";
import { StageBlock } from "@/components/templates/StageBlock";

/**
 * Parámetros del nodo: setpoints de los lazos de control y datos de firmware.
 *
 * Los paneles se anclan por separado, no en una fila flexible, para que el
 * ancho sobrante se abra entre ellos. Sin sobrante caen en 176 y 686.
 */
export function SettingsScreen() {
  return (
    <>
      <StageBlock top={190} x={176} wide>
        <SetpointPanel />
      </StageBlock>
      <StageBlock top={190} x={686} anchor="right">
        <NodePanel />
      </StageBlock>
    </>
  );
}
