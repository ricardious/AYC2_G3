"use client";
import { DataField } from "@/components/atoms/DataField";
import { useTelemetry } from "@/lib/state/hooks";

export function HistoryOverview() {
  const { series } = useTelemetry();
  const average = (key: "t" | "h") =>
    series.length
      ? (series.reduce((sum, p) => sum + p[key], 0) / series.length).toFixed(1)
      : "—";
  return (
    <div className="flex flex-wrap gap-x-12 gap-y-6">
      <DataField
        variant="md"
        label="TEMPERATURA MEDIA"
        value={`${average("t")} °C`}
      />
      <DataField
        variant="md"
        label="HUMEDAD MEDIA"
        value={`${average("h")} %`}
      />
      <DataField
        variant="md"
        label="LECTURAS DISPONIBLES"
        value={String(series.length)}
      />
    </div>
  );
}
