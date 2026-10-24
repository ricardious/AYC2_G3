"use client";

import { ActuatorPanel } from "@/components/organisms/ActuatorPanel";
import { CameraPanel } from "@/components/organisms/CameraPanel";
import { CriticalAlertBanner } from "@/components/organisms/CriticalAlertBanner";
import { EventFeed } from "@/components/organisms/EventFeed";
import { HumidityColumn } from "@/components/organisms/HumidityColumn";
import { IncubatorChamber } from "@/components/organisms/IncubatorChamber";
import { SensorPanel } from "@/components/organisms/SensorPanel";
import { SpecimenStrip } from "@/components/organisms/SpecimenStrip";
import { TelemetryChart } from "@/components/organisms/TelemetryChart";
import { TemperatureGauge } from "@/components/organisms/TemperatureGauge";
import { TrayAngleDial } from "@/components/organisms/TrayAngleDial";
import { StageBlock } from "@/components/templates/StageBlock";
import { useSmartEgg } from "@/lib/state/hooks";

/**
 * Vista operativa: lecturas en vivo a la izquierda, la incubadora al centro,
 * el estado de los componentes a la derecha y el historial abajo.
 *
 * Las coordenadas viven aquí y no en los organismos, que así se reutilizan.
 *
 * La columna derecha va con `fillRight`. El diseño le daba 300 px fijos y
 * dejaba 154 de margen, un hueco que se nota desde que el riel llega al borde.
 */
export function ControlCoreScreen() {
  const { critical } = useSmartEgg();

  return (
    <>
      {critical ? (
        <StageBlock top={96} x={566} anchor="center" wide fluid>
          <CriticalAlertBanner />
        </StageBlock>
      ) : null}

      <StageBlock top={158} x={176} fluid>
        <TemperatureGauge />
      </StageBlock>

      <StageBlock top={472} x={186} fluid>
        <HumidityColumn />
      </StageBlock>

      <StageBlock top={132} x={566} anchor="center" wide fit={548}>
        <IncubatorChamber />
      </StageBlock>

      <StageBlock top={552} x={574} anchor="center" wide fluid>
        <TrayAngleDial />
      </StageBlock>

      <StageBlock top={158} x={1226} anchor="right" fillRight fluid>
        <ActuatorPanel />
      </StageBlock>

      <StageBlock top={452} x={1226} anchor="right" fillRight fluid>
        <SensorPanel />
      </StageBlock>

      <StageBlock top={584} x={1226} anchor="right" fillRight fluid>
        <CameraPanel />
      </StageBlock>

      <StageBlock top={806} x={176} wide fluid>
        <SpecimenStrip />
      </StageBlock>

      <StageBlock top={806} x={626} anchor="center" wide fluid>
        <TelemetryChart />
      </StageBlock>

      <StageBlock top={806} x={1226} anchor="right" fillRight fluid>
        <EventFeed />
      </StageBlock>
    </>
  );
}
