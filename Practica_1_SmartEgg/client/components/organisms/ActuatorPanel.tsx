"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { ActuatorRow } from "@/components/molecules/ActuatorRow";
import { buildActuators } from "@/lib/smartegg/derive";
import { useSmartEgg } from "@/lib/state/hooks";

export function ActuatorPanel() {
  const { critical, dashboard, actions } = useSmartEgg();
  const actuators = buildActuators(critical, dashboard?.actuators);

  return (
    <section aria-label="Actuadores" className="w-full">
      <SectionKicker tone="amber">ACTUADORES</SectionKicker>
      <div className="mt-3.5 flex flex-col gap-3.5">
        {actuators.map((actuator) => (
          <ActuatorRow
            key={actuator.id}
            actuator={actuator}
            onSelect={() => actions.selectComponent(actuator.id)}
          />
        ))}
      </div>
    </section>
  );
}
