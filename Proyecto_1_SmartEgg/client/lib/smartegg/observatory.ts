import type p5 from "p5";

export interface ObservatoryState {
  temperature: number | null;
  humidity: number | null;
  occupied: number;
  angle: number | null;
  fan: boolean;
  live: boolean;
  critical: boolean;
  layer: "temperature" | "humidity";
  exploded: boolean;
  paused: boolean;
  selected: number;
  primary: string;
  foreground: string;
  warning: string;
  danger: string;
  /** El tema claro necesita trazos más opacos para leerse igual. */
  light: boolean;
}

/** Perspectiva 2D ilustrativa: no pretende modelar la distribución física del calor. */
export function observatorySketch(
  read: () => ObservatoryState,
  host: HTMLElement,
) {
  return (p: p5) => {
    let phase = 0;
    let separation = 0;
    let angle = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    p.setup = () => {
      const canvas = p.createCanvas(host.clientWidth, host.clientHeight);
      canvas.attribute("aria-hidden", "true");
      p.pixelDensity(Math.min(window.devicePixelRatio, 2));
      p.frameRate(30);
    };
    p.draw = () => {
      const s = read();
      p.clear();
      if (document.hidden) return;
      const animate = !s.paused && !motion.matches && s.live;
      if (animate) phase += Math.min(p.deltaTime, 50) * 0.001;
      separation = p.lerp(
        separation,
        s.exploded ? 75 : 0,
        motion.matches ? 1 : 0.12,
      );
      angle = p.lerp(angle, s.angle ?? 90, motion.matches ? 1 : 0.08);
      const thermal = p
        .lerpColor(
          p.color(s.primary),
          p.color(s.warning),
          Math.max(0, Math.min(1, ((s.temperature ?? 20) - 20) / 18)),
        )
        .toString();
      const accent = s.critical
        ? s.danger
        : s.layer === "temperature"
          ? thermal
          : s.primary;
      // Los alfas están calibrados sobre la cámara oscura; sobre papel el
      // mismo trazo desaparece, así que el tema claro los refuerza.
      const boost = s.light ? 1.8 : 1;
      const ink = (color: string, alpha: number) => {
        const c = p.color(color);
        c.setAlpha(Math.min(255, alpha * boost));
        return c;
      };
      p.push();
      p.translate(p.width / 2, p.height * 0.61);
      // La escena se encoge para caber; los rótulos se dividen por el mismo
      // factor para que lleguen al ojo siempre al mismo cuerpo.
      const zoom = Math.min(p.width / 690, p.height / 760);
      const labelSize = 13 / zoom;
      p.scale(zoom);
      const project = (x: number, y: number, z: number): [number, number] => [
        x * 0.86 - y * 0.72,
        x * 0.32 + y * 0.42 - z,
      ];
      const edge = (a: number[], b: number[]) =>
        p.line(...project(a[0], a[1], a[2]), ...project(b[0], b[1], b[2]));
      const plane = (z: number, fill: string, alpha: number, size = 165) => {
        p.fill(ink(fill, alpha));
        p.stroke(ink(fill, 100));
        p.strokeWeight(1);
        p.beginShape();
        for (const [x, y] of [
          [-size, -size],
          [size, -size],
          [size, size],
          [-size, size],
        ])
          p.vertex(...project(x, y, z));
        p.endShape(p.CLOSE);
      };
      p.stroke(ink(s.foreground, 17));
      p.strokeWeight(0.7);
      for (let i = -300; i <= 300; i += 30) {
        edge([i, -300, -65], [i, 300, -65]);
        edge([-300, i, -65], [300, i, -65]);
      }
      p.noFill();
      p.stroke(ink(accent, 42));
      p.ellipse(0, 25, 630, 250);
      p.stroke(ink(accent, 20));
      p.ellipse(0, 25, 660, 265);
      plane(-35, s.foreground, 12);
      plane(0, accent, 18);
      // La inclinación representa el ángulo reportado del servo.
      const trayZ = (x: number) =>
        x * Math.sin(((angle - 90) * Math.PI) / 180) * 0.24 + separation * 0.2;
      p.stroke(ink(accent, 110));
      for (let i = -140; i <= 140; i += 20)
        edge([-145, i, trayZ(-145)], [145, i, trayZ(145)]);
      for (let i = 0; i < 4; i++) {
        const x = i % 2 ? 78 : -78,
          y = i < 2 ? -73 : 73;
        const [sx, sy] = project(x, y, trayZ(x));
        p.push();
        p.translate(sx, sy);
        p.noFill();
        p.stroke(
          ink(
            s.selected === i ? accent : s.foreground,
            s.selected === i ? 230 : 65,
          ),
        );
        p.ellipse(0, 0, 84, 35);
        if (i < s.occupied) {
          for (let ring = 0; ring < 20; ring++) {
            p.fill(ink(accent, 4));
            p.noStroke();
            p.ellipse(0, -34, 70 - ring * 2, 88 - ring * 2);
          }
          p.fill(ink(s.foreground, 18));
          p.stroke(ink(accent, 190));
          p.beginShape();
          for (let t = 0; t <= Math.PI * 2 + 0.05; t += 0.05)
            p.vertex(
              33 * Math.sin(t) * (1 - 0.2 * Math.cos(t)),
              -44 - 45 * Math.cos(t),
            );
          p.endShape(p.CLOSE);
          p.noFill();
          p.stroke(ink(s.foreground, 65));
          p.arc(-4, -46, 31, 60, Math.PI, Math.PI * 1.55);
        }
        p.noStroke();
        p.fill(ink(s.foreground, 225));
        p.textFont("monospace");
        p.textSize(labelSize);
        p.textAlign(p.CENTER);
        p.text(`0${i + 1}`, 0, 25);
        p.pop();
      }
      // Densidad ligada a humedad; velocidad ligada al estado real del ventilador.
      if (s.humidity !== null && s.temperature !== null) {
        const count = Math.round(Math.max(0, Math.min(100, s.humidity)) * 0.7);
        for (let i = 0; i < count; i++) {
          const z = (i * 23 + phase * (s.fan ? 48 : 0)) % 220;
          const x = Math.sin(i * 2.4 + phase * 0.15) * 135;
          const y = Math.cos(i * 1.8 + phase * 0.15) * 135;
          const [sx, sy] = project(x, y, z);
          p.stroke(ink(accent, s.live ? 95 : 30));
          p.strokeWeight(1.5);
          p.line(sx, sy, sx, sy + (s.fan ? 8 : 2));
        }
      }
      const roof = 235 + separation;
      p.stroke(ink(s.foreground, 75));
      p.strokeWeight(1);
      for (const [x, y] of [
        [-165, -165],
        [165, -165],
        [165, 165],
        [-165, 165],
      ])
        edge([x, y, 0], [x, y, roof]);
      plane(roof, s.primary, 9);
      const [fx, fy] = project(0, 0, roof + 3);
      p.push();
      p.translate(fx, fy);
      p.scale(1, 0.46);
      p.noFill();
      p.stroke(ink(s.primary, 130));
      p.circle(0, 0, 92);
      p.circle(0, 0, 103);
      p.rotate(s.fan ? phase * 3 : 0);
      for (let i = 0; i < 4; i++) {
        p.rotate(Math.PI / 2);
        p.fill(ink(s.primary, 40));
        p.ellipse(20, 0, 34, 13);
      }
      p.pop();
      p.noStroke();
      p.fill(ink(s.foreground, 215));
      p.textSize(labelSize);
      p.textAlign(p.LEFT);
      p.text("SMART EGG / 01", -260, 172);
      p.fill(ink(accent, 235));
      p.text(s.live ? "● SEÑAL ACTIVA" : "○ ÚLTIMA LECTURA", 115, 172);
      p.pop();
    };
  };
}
