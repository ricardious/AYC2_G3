"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { SensorRow } from "@/components/molecules/SensorRow";
import { buildSensors } from "@/lib/smartegg/derive";
import { useSmartEgg } from "@/lib/state/hooks";

export function SensorPanel() {
  const { dashboard, actions } = useSmartEgg();
  const sensors = buildSensors(dashboard?.sensors ?? []);

  return (
    <section aria-label="Sensores" className="w-full">
      <SectionKicker tone="cyan">SENSORES</SectionKicker>
      <div className="mt-3.5 flex flex-col gap-[11px]">
        {sensors.map((sensor) => (
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
