import { EGGS, EMPTY_SLOT_LABEL } from "./catalog";
import {
  DANGER,
  DANGER_SOFT,
  DOT_IDLE,
  FOREGROUND,
  FOREGROUND_FAINT,
  FOREGROUND_FAINTER,
  FOREGROUND_MUTED,
  NEUTRAL,
  PRIMARY,
  SUCCESS,
  WARNING,
} from "./theme";
import type {
  ActuatorView,
  ComponentId,
  DetailPanel,
  DetailRow,
  EggView,
  EventView,
  HeaderStat,
  HotspotView,
  Selection,
  SensorView,
  SeriesPoint,
} from "./types";

/**
 * Proyecciones puras de `(estado, config)` a modelos de vista.
 *
 * Al mantenerlas fuera de los componentes, cada pantalla se dibuja a partir
 * de datos planos y toda la consola se puede razonar (y probar) sin DOM.
 */

/* ------------------------------------------------------------- lecturas */

export interface TemperatureReading {
  value: number;
  label: string;
  color: string;
  deviation: string;
}

export function readTemperature(
  latest: SeriesPoint,
  critical: boolean,
): TemperatureReading {
  const value = critical ? 40.2 : Math.round(latest.t * 10) / 10;
  return {
    value,
    label: value.toFixed(1),
    color: critical ? DANGER : WARNING,
    deviation: `${value > 38 ? "+" : ""}${(value - 37.5).toFixed(1)} °C`,
  };
}

export function readHumidity(latest: SeriesPoint, critical: boolean): number {
  return critical ? 54 : Math.round(latest.h);
}

/** Inclinación de la bandeja; se nivela mientras la alarma está activa. */
export function trayTilt(critical: boolean): number {
  return critical ? 0 : 6;
}

export function trayAngle(critical: boolean): { label: string; pct: number } {
  return critical ? { label: "0°", pct: 50 } : { label: "+45°", pct: 100 };
}

export function nodeStatus(critical: boolean): { word: string; color: string } {
  return critical
    ? { word: "CRÍTICO", color: DANGER }
    : { word: "ÓPTIMO", color: SUCCESS };
}

/* ------------------------------------------------------------ encabezado */

export function buildHeaderStats(
  critical: boolean,
  clock: string,
  technician: string,
): HeaderStat[] {
  return [
    {
      label: "CONEXIÓN",
      value: "ONLINE",
      color: FOREGROUND_MUTED,
      dot: SUCCESS,
    },
    {
      label: "ÚLTIMA ACTUALIZACIÓN",
      value: clock,
      color: FOREGROUND_MUTED,
      dot: PRIMARY,
    },
    {
      label: "ESTADO",
      value: critical ? "CRÍTICO" : "ÓPTIMO",
      color: critical ? DANGER_SOFT : FOREGROUND_MUTED,
      dot: critical ? DANGER : SUCCESS,
    },
    {
      label: "TÉCNICO",
      value: technician,
      color: FOREGROUND_MUTED,
      dot: DOT_IDLE,
    },
  ];
}

/* ---------------------------------------------------------------- huevos */

export function buildEggViews(
  hoveredEgg: string | null,
  selection: Selection,
): EggView[] {
  return EGGS.map((egg) => {
    const hovered = hoveredEgg === egg.code;
    const selected = selection?.type === "egg" && selection.id === egg.code;

    return {
      id: egg.code,
      label: egg.empty ? EMPTY_SLOT_LABEL : egg.code,
      line2: egg.empty ? "SIN ASIGNAR" : `DÍA ${egg.dia}`,
      line3: egg.estado,
      stateColor: egg.empty ? FOREGROUND_FAINT : SUCCESS,
      empty: egg.empty,
      hot: hovered || selected,
      hovered,
    };
  });
}

/* ------------------------------------------------------------ actuadores */

export function buildActuators(critical: boolean): ActuatorView[] {
  return [
    {
      id: "ventilador",
      name: "Ventilador",
      state: "ACTIVO",
      metric: critical ? "100 %" : "60 %",
      color: PRIMARY,
      pulse: "fan",
    },
    {
      id: "calefaccion",
      name: "Calefacción",
      state: critical ? "APAGADA" : "ACTIVA",
      metric: critical ? "0 %" : "42 %",
      color: critical ? DANGER : WARNING,
      pulse: "heater",
    },
    {
      id: "servo",
      name: "Rotación",
      state: "ACTIVA",
      metric: critical ? "0°" : "+45°",
      color: PRIMARY,
      pulse: "servo",
    },
    {
      id: "buzzer",
      name: "Buzzer",
      state: critical ? "ACTIVO" : "INACTIVO",
      metric: critical ? "85 dB" : "—",
      color: critical ? DANGER : FOREGROUND_FAINTER,
      pulse: critical ? "alarm" : "none",
    },
  ];
}

export const SENSORS: readonly SensorView[] = [
  { id: "dht", name: "DHT", state: "ONLINE", color: SUCCESS, delay: 0 },
  {
    id: "limit",
    name: "Final de carrera",
    state: "ONLINE",
    color: SUCCESS,
    delay: 0.5,
  },
  {
    id: "slots",
    name: "Sensor de espacios",
    state: "ONLINE",
    color: SUCCESS,
    delay: 1,
  },
];

/** Rótulos unidos al diagrama de la cámara por una línea guía. */
export function buildHotspots(critical: boolean): HotspotView[] {
  return [
    {
      id: "dht",
      label: "SENSOR DHT",
      state: "ONLINE",
      stateColor: SUCCESS,
      x: -140,
      y: 58,
      align: "right",
    },
    {
      id: "calefaccion",
      label: "CALEFACCIÓN",
      state: critical ? "APAGADA" : "ACTIVA",
      stateColor: critical ? DANGER : WARNING,
      x: 560,
      y: 84,
      align: "left",
    },
    {
      id: "ventilador",
      label: "VENTILADOR",
      state: "FLUJO DE AIRE ACTIVO",
      stateColor: PRIMARY,
      x: 560,
      y: 238,
      align: "left",
    },
    {
      id: "bandeja",
      label: "SERVO / BANDEJA",
      state: "ROTACIÓN ACTIVA",
      stateColor: PRIMARY,
      x: -160,
      y: 318,
      align: "right",
    },
  ];
}

/* ---------------------------------------------------------------- eventos */

export function buildEvents(critical: boolean): EventView[] {
  const rows: readonly [string, string, string, string][] = critical
    ? [
        ["10:42:18", "ALERTA", "40.2 °C · fuera de rango seguro", DANGER],
        ["10:42:16", "CALEFACCIÓN", "Desactivada por seguridad", DANGER],
        ["10:42:14", "VENTILACIÓN", "Ventilador a 100 %", PRIMARY],
        ["10:42:02", "TEMPERATURA", "39.4 °C · en ascenso", WARNING],
      ]
    : [
        ["10:42:10", "ROTACIÓN", "Bandeja posicionada en +45°", PRIMARY],
        ["10:41:52", "VENTILACIÓN", "Ventilador activado", PRIMARY],
        ["10:41:40", "TEMPERATURA", "37.6 °C · estable", WARNING],
        ["10:41:32", "HUMEDAD", "58 % · normal", PRIMARY],
      ];

  return rows.map(([time, kind, text, color]) => ({ time, kind, text, color }));
}

/* ------------------------------------------------- fichas de componentes */

interface ComponentSpec {
  kicker: string;
  title: string;
  accent: string;
  rows: readonly (readonly [string, string, string])[];
}

export function buildComponentCatalog(
  critical: boolean,
): Record<ComponentId, ComponentSpec> {
  return {
    ventilador: {
      kicker: "ACTUADOR",
      title: "VENTILADOR",
      accent: PRIMARY,
      rows: [
        ["ESTADO", "ACTIVO", SUCCESS],
        ["VELOCIDAD", critical ? "100 %" : "60 %", PRIMARY],
        ["MODO", "AUTOMÁTICO", NEUTRAL],
        [
          "MOTIVO",
          critical ? "DISIPACIÓN DE CALOR" : "CONTROL DE TEMPERATURA",
          NEUTRAL,
        ],
        ["FLUJO", critical ? "3.1 m/s" : "1.8 m/s", PRIMARY],
      ],
    },
    calefaccion: {
      kicker: "ACTUADOR",
      title: "CALEFACCIÓN",
      accent: WARNING,
      rows: [
        [
          "ESTADO",
          critical ? "APAGADA" : "ACTIVA",
          critical ? DANGER : WARNING,
        ],
        ["POTENCIA", critical ? "0 %" : "42 %", WARNING],
        ["MODO", "PID", NEUTRAL],
        ["SETPOINT", "37.5 °C", NEUTRAL],
        ["CICLOS / H", "14", NEUTRAL],
      ],
    },
    servo: {
      kicker: "ACTUADOR",
      title: "SERVO ROTACIÓN",
      accent: PRIMARY,
      rows: [
        ["ESTADO", "ACTIVO", SUCCESS],
        ["ÁNGULO", "+45°", PRIMARY],
        ["INTERVALO", "2 H", NEUTRAL],
        ["ÚLTIMO GIRO", "10:42:10", NEUTRAL],
        ["FIN DE CARRERA", "OK", SUCCESS],
      ],
    },
    buzzer: {
      kicker: "ACTUADOR",
      title: "BUZZER",
      accent: critical ? DANGER : NEUTRAL,
      rows: [
        [
          "ESTADO",
          critical ? "ACTIVO" : "INACTIVO",
          critical ? DANGER : NEUTRAL,
        ],
        [
          "PATRÓN",
          critical ? "ALARMA TÉRMICA" : "—",
          critical ? DANGER : NEUTRAL,
        ],
        ["VOLUMEN", critical ? "85 dB" : "—", NEUTRAL],
      ],
    },
    dht: {
      kicker: "SENSOR",
      title: "SENSOR DHT",
      accent: PRIMARY,
      rows: [
        ["ESTADO", "ONLINE", SUCCESS],
        [
          "TEMPERATURA",
          `${critical ? "40.2" : "37.6"} °C`,
          critical ? DANGER : WARNING,
        ],
        ["HUMEDAD", "58 %", PRIMARY],
        ["MUESTREO", "2 s", NEUTRAL],
        ["DERIVA", "±0.2 °C", NEUTRAL],
      ],
    },
    limit: {
      kicker: "SENSOR",
      title: "FINAL DE CARRERA",
      accent: SUCCESS,
      rows: [
        ["ESTADO", "ONLINE", SUCCESS],
        ["POSICIÓN", "+45°", PRIMARY],
        ["PULSOS", "48", NEUTRAL],
      ],
    },
    slots: {
      kicker: "SENSOR",
      title: "SENSOR DE ESPACIOS",
      accent: SUCCESS,
      rows: [
        ["ESTADO", "ONLINE", SUCCESS],
        ["OCUPADOS", "3 / 4", PRIMARY],
        ["LIBRE", "POSICIÓN 04", NEUTRAL],
      ],
    },
    bandeja: {
      kicker: "MECANISMO",
      title: "BANDEJA",
      accent: PRIMARY,
      rows: [
        ["ÁNGULO", "+45°", PRIMARY],
        ["ESPACIOS", "4", NEUTRAL],
        ["CARGA", "3 ESPECÍMENES", NEUTRAL],
        ["MATERIAL", "POLÍMERO TÉCNICO", NEUTRAL],
      ],
    },
  };
}

function toRows(
  rows: readonly (readonly [string, string, string])[],
): DetailRow[] {
  return rows.map(([label, value, color]) => ({ label, value, color }));
}

/** Contenido del inspector, o `null` si no hay nada seleccionado. */
export function buildSelectionDetail(
  selection: Selection,
  critical: boolean,
): DetailPanel | null {
  if (!selection) return null;

  if (selection.type === "component") {
    const spec = buildComponentCatalog(critical)[selection.id];
    return {
      kicker: spec.kicker,
      title: spec.title,
      accent: spec.accent,
      rows: toRows(spec.rows),
    };
  }

  if (selection.type === "egg") {
    const egg = EGGS.find((candidate) => candidate.code === selection.id);
    if (!egg) return null;

    return {
      kicker: "ESPÉCIMEN",
      title: egg.code,
      accent: PRIMARY,
      rows: toRows([
        ["LOTE", egg.lote, FOREGROUND],
        ["INGRESO", "11 AGO 2026", FOREGROUND],
        ["POSICIÓN", egg.pos, FOREGROUND],
        ["INCUBACIÓN", `DÍA ${egg.dia}`, PRIMARY],
        ["ESTADO", egg.estado, SUCCESS],
        [
          "TEMP. LOCAL",
          `${critical ? "40.1" : "37.6"} °C`,
          critical ? DANGER : WARNING,
        ],
      ]),
    };
  }

  return {
    kicker: "ESPACIO",
    title: "POSICIÓN 04",
    accent: NEUTRAL,
    rows: toRows([
      ["ESTADO", "DISPONIBLE", NEUTRAL],
      ["SENSOR", "SIN DETECCIÓN", NEUTRAL],
      ["ACCIÓN", "REGISTRAR HUEVO", PRIMARY],
    ]),
  };
}
