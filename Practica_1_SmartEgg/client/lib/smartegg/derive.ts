import type { Actuator, Alarm, Sensor } from "@/lib/api/types";
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
  latest: SeriesPoint | null,
  critical: boolean,
): TemperatureReading {
  const value = latest ? Math.round(latest.t * 10) / 10 : 35;
  return {
    value,
    label: latest ? value.toFixed(1) : "—",
    color: critical ? DANGER : WARNING,
    deviation: latest
      ? `${value > 38 ? "+" : ""}${(value - 37.5).toFixed(1)} °C`
      : "SIN DATOS",
  };
}

export function readHumidity(
  latest: SeriesPoint | null,
): number | null {
  return latest ? Math.round(latest.h) : null;
}

/** Inclinación de la bandeja; se nivela mientras la alarma está activa. */
export function trayTilt(critical: boolean): number {
  return critical ? 0 : 6;
}

export interface TrayAngleReading {
  label: string;
  pct: number;
  limit: number;
}

/** Proyecta el ángulo firmado del servo sobre la escala de la bandeja. */
export function readTrayAngle(
  angleDegrees: number | null | undefined,
  configuredLimit = 45,
): TrayAngleReading {
  const limit = Number.isFinite(configuredLimit)
    ? Math.max(1, Math.abs(Math.round(configuredLimit)))
    : 45;

  if (angleDegrees == null || !Number.isFinite(angleDegrees)) {
    return { label: "—", pct: 50, limit };
  }

  const roundedAngle = Math.round(angleDegrees);
  const positionAngle = Math.max(-limit, Math.min(limit, angleDegrees));
  return {
    label: `${roundedAngle > 0 ? "+" : ""}${roundedAngle}°`,
    pct: ((positionAngle + limit) / (limit * 2)) * 100,
    limit,
  };
}

/** @deprecated Usar `readTrayAngle` con el valor real del actuador. */
export function trayAngle(critical: boolean): TrayAngleReading {
  return readTrayAngle(critical ? 0 : 45);
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
  connection: "connecting" | "live" | "polling" | "offline" = "offline",
): HeaderStat[] {
  const connectionLabels = {
    connecting: "CONECTANDO",
    live: "EN VIVO",
    polling: "REST",
    offline: "OFFLINE",
  } as const;
  return [
    {
      label: "CONEXIÓN",
      value: connectionLabels[connection],
      color: FOREGROUND_MUTED,
      dot:
        connection === "offline"
          ? DANGER
          : connection === "live"
            ? SUCCESS
            : WARNING,
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

export const EGG_SLOT_COUNT = 4;

/** Convierte cualquier lectura Serial en una ocupación segura para la UI. */
export function normalizeOccupiedSlots(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(EGG_SLOT_COUNT, Math.trunc(value)));
}

export function buildEggViews(
  hoveredEgg: string | null,
  selection: Selection,
  occupiedSlots: number,
): EggView[] {
  const occupied = normalizeOccupiedSlots(occupiedSlots);

  return Array.from({ length: EGG_SLOT_COUNT }, (_, index) => {
    const position = index + 1;
    const positionLabel = String(position).padStart(2, "0");
    const id = `slot-${position}`;
    const empty = position > occupied;
    const hovered = hoveredEgg === id;
    const selected =
      (selection?.type === "egg" || selection?.type === "slot") &&
      selection.id === id;

    return {
      id,
      label: empty ? `POS ${positionLabel}` : `HUEVO ${positionLabel}`,
      line2: empty ? "SIN DETECCIÓN" : "SENSOR ACTIVO",
      line3: empty ? "DISPONIBLE" : "OCUPADO",
      stateColor: empty ? FOREGROUND_FAINT : SUCCESS,
      empty,
      hot: hovered || selected,
      hovered,
    };
  });
}

/* ------------------------------------------------------------ actuadores */

export function buildActuators(
  critical: boolean,
  states: Actuator[] = [],
): ActuatorView[] {
  const state = (kind: Actuator["kind"]) =>
    states.find((item) => item.kind === kind);
  const fan = state("fan");
  const heater = state("heater");
  const servo = state("servo");
  const buzzer = state("buzzer");
  return [
    {
      id: "ventilador",
      name: "Ventilador",
      state: fan?.enabled ? "ACTIVO" : "INACTIVO",
      metric: fan?.value == null ? (fan?.enabled ? "ON" : "—") : `${fan.value} %`,
      color: fan?.enabled ? PRIMARY : FOREGROUND_FAINTER,
      pulse: fan?.enabled ? "fan" : "none",
    },
    {
      id: "calefaccion",
      name: "Calefacción",
      state: heater?.enabled ? "ACTIVA" : "APAGADA",
      metric:
        heater?.value == null
          ? heater?.enabled
            ? "ON"
            : "—"
          : `${heater.value} %`,
      color: heater?.enabled ? WARNING : FOREGROUND_FAINTER,
      pulse: heater?.enabled ? "heater" : "none",
    },
    {
      id: "servo",
      name: "Rotación",
      state: servo?.enabled ? "ACTIVA" : "INACTIVA",
      metric: servo?.value == null ? "—" : `${servo.value > 0 ? "+" : ""}${servo.value}°`,
      color: servo?.enabled ? PRIMARY : FOREGROUND_FAINTER,
      pulse: servo?.enabled ? "servo" : "none",
    },
    {
      id: "buzzer",
      name: "Buzzer",
      state: buzzer?.enabled ? "ACTIVO" : "INACTIVO",
      metric: buzzer?.enabled ? "ALARMA" : "—",
      color: buzzer?.enabled || critical ? DANGER : FOREGROUND_FAINTER,
      pulse: buzzer?.enabled ? "alarm" : "none",
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

export function buildSensors(sensors: Sensor[]): SensorView[] {
  if (sensors.length === 0) return SENSORS.map((sensor) => ({ ...sensor, state: "SIN DATOS", color: FOREGROUND_FAINTER }));
  const environmental = sensors.filter((sensor) =>
    ["temperature", "humidity"].includes(sensor.kind),
  );
  const door = sensors.find((sensor) => sensor.kind === "limit_switch");
  const slots = sensors.find((sensor) => sensor.kind === "pressure");
  const view = (
    id: ComponentId,
    name: string,
    active: boolean,
    delay: number,
  ): SensorView => ({
    id,
    name,
    state: active ? "ONLINE" : "INACTIVO",
    color: active ? SUCCESS : DANGER,
    delay,
  });
  return [
    view(
      "dht",
      "DHT11",
      environmental.length >= 2 && environmental.every((sensor) => sensor.is_active),
      0,
    ),
    view("limit", "Final de carrera", Boolean(door?.is_active), 0.5),
    view("slots", "Sensor de espacios", Boolean(slots?.is_active), 1),
  ];
}

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

export function buildEvents(alarms: Alarm[] = []): EventView[] {
  if (alarms.length > 0) {
    return alarms.slice(0, 4).map((alarm) => ({
      time: new Intl.DateTimeFormat("es-GT", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(alarm.occurred_at)),
      kind: alarm.severity === "critical" ? "ALERTA" : "AVISO",
      text: alarm.message,
      color: alarm.severity === "critical" ? DANGER : WARNING,
    }));
  }
  return [];
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
  occupiedSlots = 0,
): Record<ComponentId, ComponentSpec> {
  const occupied = normalizeOccupiedSlots(occupiedSlots);
  const available = EGG_SLOT_COUNT - occupied;
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
        ["OCUPADOS", `${occupied} / ${EGG_SLOT_COUNT}`, PRIMARY],
        ["DISPONIBLES", String(available), NEUTRAL],
      ],
    },
    bandeja: {
      kicker: "MECANISMO",
      title: "BANDEJA",
      accent: PRIMARY,
      rows: [
        ["ÁNGULO", "+45°", PRIMARY],
        ["ESPACIOS", String(EGG_SLOT_COUNT), NEUTRAL],
        ["CARGA", `${occupied} HUEVOS`, NEUTRAL],
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
  occupiedSlots = 0,
): DetailPanel | null {
  if (!selection) return null;

  if (selection.type === "component") {
    const spec = buildComponentCatalog(critical, occupiedSlots)[selection.id];
    return {
      kicker: spec.kicker,
      title: spec.title,
      accent: spec.accent,
      rows: toRows(spec.rows),
    };
  }

  const position = Number(selection.id.replace("slot-", ""));
  if (!Number.isInteger(position) || position < 1 || position > EGG_SLOT_COUNT) {
    return null;
  }
  const positionLabel = String(position).padStart(2, "0");
  const occupied = position <= normalizeOccupiedSlots(occupiedSlots);

  if (occupied) {
    return {
      kicker: "DETECCIÓN FÍSICA",
      title: `HUEVO ${positionLabel}`,
      accent: PRIMARY,
      rows: toRows([
        ["POSICIÓN", positionLabel, FOREGROUND],
        ["SENSOR", "ACTIVO", SUCCESS],
        ["ESTADO", "OCUPADO", SUCCESS],
      ]),
    };
  }

  return {
    kicker: "ESPACIO",
    title: `POSICIÓN ${positionLabel}`,
    accent: NEUTRAL,
    rows: toRows([
      ["ESTADO", "DISPONIBLE", NEUTRAL],
      ["SENSOR", "SIN DETECCIÓN", NEUTRAL],
      ["ACCIÓN", "REGISTRAR HUEVO", PRIMARY],
    ]),
  };
}
