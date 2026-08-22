import { DataField } from "@/components/atoms/DataField";
import { HISTORY_STATS } from "@/lib/smartegg/catalog";

/** Agregados de las últimas 24 horas. */
export function HistoryOverview() {
  return (
    <div className="flex flex-wrap gap-x-12 gap-y-6">
      {HISTORY_STATS.map((stat) => (
        <DataField
          key={stat.label}
          variant="md"
          label={stat.label}
          value={stat.value}
          valueColor={stat.color}
        />
      ))}
    </div>
  );
}
