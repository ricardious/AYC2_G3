import { PARTICLES } from "@/lib/smartegg/catalog";
import type { CSSVars } from "@/lib/smartegg/types";

/** Motas de polvo que ascienden por el fondo de la consola. */
export function ParticleField() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {PARTICLES.map((particle, index) => {
        // Duración y retardo van por partícula, así que la animación se
        // declara en línea y no con una utilidad `animate-*`.
        const style: CSSVars = {
          left: `${particle.x}%`,
          top: `${particle.y}%`,
          animation: `se-drift ${particle.duration}s linear ${particle.delay}s infinite`,
        };
        return (
          <span
            key={index}
            className="pointer-events-none absolute size-0.5 rounded-full bg-[rgba(160,220,230,.75)]"
            style={style}
          />
        );
      })}
    </div>
  );
}
