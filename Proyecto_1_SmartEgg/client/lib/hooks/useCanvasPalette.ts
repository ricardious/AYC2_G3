"use client";
import { useEffect, useState } from "react";

/** Convierte los tokens OKLCH a RGB para los motores canvas. */
export function useCanvasPalette() {
  const [palette, setPalette] = useState({
    primary: "rgb(60,180,190)",
    foreground: "rgb(140,150,160)",
    warning: "rgb(220,150,60)",
    danger: "rgb(230,70,70)",
    /** Sobre papel el trazo necesita más cuerpo que sobre la cámara oscura. */
    light: false,
  });
  useEffect(() => {
    const sync = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      const probe = document.createElement("span");
      document.body.appendChild(probe);
      const color = (name: string) => {
        probe.style.color = `var(--color-${name})`;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = getComputedStyle(probe).color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${r},${g},${b})`;
      };
      const background = color("background")
        .slice(4, -1)
        .split(",")
        .map(Number);
      setPalette({
        primary: color("primary"),
        foreground: color("foreground"),
        warning: color("warning"),
        danger: color("danger"),
        light:
          (0.2126 * background[0] +
            0.7152 * background[1] +
            0.0722 * background[2]) /
            255 >
          0.5,
      });
      probe.remove();
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);
  return palette;
}
