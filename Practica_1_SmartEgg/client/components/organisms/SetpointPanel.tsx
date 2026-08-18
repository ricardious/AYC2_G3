import { SectionKicker } from "@/components/atoms/SectionKicker";
import { SetpointSlider } from "@/components/molecules/SetpointSlider";
import { SETPOINTS } from "@/lib/smartegg/catalog";

export function SetpointPanel() {
  return (
    <section aria-label="Calibración de setpoints" className="w-[420px]">
      <SectionKicker>CALIBRACIÓN DE SETPOINTS</SectionKicker>
      <div className="mt-7 flex flex-col gap-[34px]">
        {SETPOINTS.map((setpoint) => (
          <SetpointSlider key={setpoint.label} {...setpoint} />
        ))}
      </div>
    </section>
  );
}
