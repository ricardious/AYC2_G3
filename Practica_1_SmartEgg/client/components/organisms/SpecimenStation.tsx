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
    <div className="relative h-[470px] w-[1120px]">
      <div
        aria-hidden="true"
        className="bench-surface absolute inset-x-0 top-10 h-[390px] border border-frame-soft [transform:perspective(1400px)_rotateX(16deg)]"
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
