"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { EventRow } from "@/components/molecules/EventRow";
import { buildEvents } from "@/lib/smartegg/derive";
import { useSmartEgg } from "@/lib/state/hooks";

/** Bitácora de eventos del nodo en vivo. */
export function EventFeed() {
  const { critical } = useSmartEgg();
  const events = buildEvents(critical);

  return (
    <section aria-label="Eventos en vivo" className="w-full">
      <SectionKicker>EVENTOS · EN VIVO</SectionKicker>
      <ul className="mt-3.5 flex list-none flex-col gap-3 p-0">
        {events.map((event) => (
          <EventRow key={`${event.time}-${event.kind}`} {...event} />
        ))}
      </ul>
    </section>
  );
}
