"use client";

import { GhostButton } from "@/components/atoms/GhostButton";
import { StationEgg } from "@/components/molecules/StationEgg";
import { useEggViews, useSmartEgg } from "@/lib/state/hooks";

/** Mesa de análisis de la pantalla de incubación. */
export function SpecimenStation() {
  const { critical, actions } = useSmartEgg();
  const eggs = useEggViews();
  const emptySlot = eggs.find((egg) => egg.empty);

  return (
    <div className="relative h-[430px] w-[1120px]">
      <div
        aria-hidden="true"
        className="bench-surface absolute inset-x-0 top-[70px] h-[300px] border border-[rgba(150,180,195,.18)] [transform:perspective(1400px)_rotateX(16deg)]"
      />

      <div className="absolute inset-x-0 top-24 flex justify-center gap-16">
        {eggs.map((egg) => (
          <StationEgg
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

      <div className="absolute inset-x-0 top-[398px] flex justify-center">
        <GhostButton
          tone="dashed"
          disabled={!emptySlot}
          onClick={() => emptySlot && actions.pickEgg(emptySlot)}
        >
          + REGISTRAR HUEVO
        </GhostButton>
      </div>
    </div>
  );
}
