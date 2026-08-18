"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { SensorRow } from "@/components/molecules/SensorRow";
import { SENSORS } from "@/lib/smartegg/derive";
import { useSmartEgg } from "@/lib/state/hooks";

export function SensorPanel() {
  const { actions } = useSmartEgg();

  return (
    <section aria-label="Sensores" className="w-full">
      <SectionKicker tone="cyan">SENSORES</SectionKicker>
      <div className="mt-3.5 flex flex-col gap-[11px]">
        {SENSORS.map((sensor) => (
          <SensorRow
            key={sensor.id}
            sensor={sensor}
            onSelect={() => actions.selectComponent(sensor.id)}
          />
        ))}
      </div>
    </section>
  );
}
