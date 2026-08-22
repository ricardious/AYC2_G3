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
    <div className="relative h-[470px] w-[1120px]">
      <div
        aria-hidden="true"
        className="bench-surface absolute inset-x-0 top-10 h-[390px] border border-[rgba(150,180,195,.18)] [transform:perspective(1400px)_rotateX(16deg)]"
      />

      <div className="absolute inset-x-0 top-5 grid grid-cols-2 place-items-center gap-x-20 gap-y-3 px-[330px]">
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

      <div className="absolute inset-x-0 top-[442px] flex justify-center">
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
