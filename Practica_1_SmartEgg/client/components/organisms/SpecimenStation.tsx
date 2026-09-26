"use client";

import { GhostButton } from "@/components/atoms/GhostButton";
import { StationEgg } from "@/components/molecules/StationEgg";
import { useEggViews, useSmartEgg } from "@/lib/state/hooks";

/** Mesa de análisis de la pantalla de incubación. */
export function SpecimenStation() {
  const { critical, actions } = useSmartEgg();
  const eggs = useEggViews();
  const pendingEgg = eggs.find((egg) => !egg.empty && !egg.registered);
  const occupiedEggs = eggs.filter((egg) => !egg.empty);

  return (
    <div className="relative w-full console:h-[470px] console:w-[1120px]">
      <div
        aria-hidden="true"
        className="bench-surface absolute inset-x-0 top-6 bottom-14 border border-frame-soft [transform:perspective(1400px)_rotateX(16deg)] console:top-10 console:bottom-auto console:h-[390px]"
      />

      <div className="relative grid grid-cols-2 place-items-center gap-x-2 gap-y-4 pt-2 console:absolute console:inset-x-0 console:top-5 console:gap-x-20 console:gap-y-3 console:px-[330px] console:pt-0">
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

      <div className="relative mt-4 flex justify-center console:absolute console:inset-x-0 console:top-[442px] console:mt-0">
        <GhostButton
          tone="dashed"
          disabled={!pendingEgg}
          onClick={() =>
            pendingEgg &&
            actions.openEggRegistration(
              Number(pendingEgg.id.replace("slot-", "")),
            )
          }
        >
          {pendingEgg
            ? "+ REGISTRAR HUEVO"
            : occupiedEggs.length > 0
              ? "FICHAS COMPLETAS"
              : "SIN HUEVOS DETECTADOS"}
        </GhostButton>
      </div>
    </div>
  );
}
