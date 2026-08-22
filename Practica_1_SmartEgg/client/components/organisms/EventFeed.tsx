"use client";

import { SectionKicker } from "@/components/atoms/SectionKicker";
import { EventRow } from "@/components/molecules/EventRow";
import { buildEvents } from "@/lib/smartegg/derive";
import { useSmartEgg } from "@/lib/state/hooks";

/** Bitácora de eventos del nodo en vivo. */
export function EventFeed() {
  const { dashboard } = useSmartEgg();
  const events = buildEvents(dashboard?.active_alarms);

  return (
    <section aria-label="Eventos en vivo" className="w-full">
      <SectionKicker>EVENTOS · EN VIVO</SectionKicker>
      <ul className="mt-3.5 flex list-none flex-col gap-3 p-0">
        {events.map((event) => (
          <EventRow key={`${event.time}-${event.kind}`} {...event} />
        ))}
        {events.length === 0 ? (
          <li className="font-mono text-[8px] tracking-[0.15em] text-foreground-fainter">
            SIN ALARMAS ACTIVAS
          </li>
        ) : null}
      </ul>
    </section>
  );
}
