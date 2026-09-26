"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { EggChip } from "@/components/molecules/EggChip";
import { useEggViews, useSmartEgg } from "@/lib/state/hooks";

/** Listado de las cuatro posiciones de bandeja del lote activo. */
export function SpecimenStrip() {
  const { critical, actions } = useSmartEgg();
  const eggs = useEggViews();

  return (
    <section
      aria-label="Huevos del lote A"
      className="w-full max-w-[400px] console:w-[400px]"
    >
      <SectionKicker>HUEVOS · LOTE A</SectionKicker>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 console:flex console:gap-3">
        {eggs.map((egg) => (
          <EggChip
            key={egg.id}
            egg={egg}
            critical={critical}
            onSelect={() => actions.pickEgg(egg)}
            onHoverChange={(hovered) =>
              actions.hoverEgg(hovered ? egg.id : null)
            }
          />
        ))}
      </div>
    </section>
  );
}
