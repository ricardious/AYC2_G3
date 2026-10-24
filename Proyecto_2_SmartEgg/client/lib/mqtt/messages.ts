export interface MqttCriticalAlarm {
  kind: string;
  severity: "critical";
  message: string;
  value: number | null;
  occurred_at: string;
}

export interface MqttActuatorState {
  heater: boolean;
  fan: boolean;
  servo_angle: number | null;
  buzzer: boolean;
  recorded_at: string;
}

export interface MqttTelemetry {
  temperature_c: number;
  humidity_pct: number;
  door_open: boolean | null;
  system_enabled: boolean | null;
  sensor_ok: boolean | null;
  occupied_slots: number;
  available_slots?: number;
  recorded_at: string;
}

/** Estado normal/bloqueado que confirma la ESP32 (topic `sistema/estado`). */
export interface MqttSystemState {
  locked: boolean;
  reason: string | null;
  recorded_at: string;
}

/** Última foto clasificada por el servicio de visión (`vision/resultado`). */
export interface MqttVisionResult {
  clase: string;
  confianza: number;
  votos_objeto: number;
  ventana: number;
  objeto_detectado: boolean;
  recorded_at: string;
}

export type SmartEggMqttMessage =
  | { type: "alarm"; alarm: MqttCriticalAlarm | null }
  | { type: "system"; system: MqttSystemState }
  | { type: "vision"; vision: MqttVisionResult }
  | { type: "status"; online: boolean }
  | { type: "actuators"; actuators: MqttActuatorState }
  | { type: "telemetry"; telemetry: MqttTelemetry };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(payload: Uint8Array): Record<string, unknown> | null {
  try {
    const decoded: unknown = JSON.parse(new TextDecoder().decode(payload));
    return isRecord(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function parseMqttMessage(
  topic: string,
  payload: Uint8Array,
  nodeCode: string,
): SmartEggMqttMessage | null {
  const prefix = `smartegg/${nodeCode}/`;
  if (!topic.startsWith(prefix)) return null;
  const suffix = topic.slice(prefix.length);

  if (suffix === "alarmas/critica" && payload.byteLength === 0) {
    return { type: "alarm", alarm: null };
  }

  const data = parseJson(payload);
  if (!data) return null;

  if (suffix === "status") {
    if (data.status !== "online" && data.status !== "offline") return null;
    return { type: "status", online: data.status === "online" };
  }

  if (suffix === "telemetria") {
    if (
      typeof data.temperature_c !== "number" ||
      !Number.isFinite(data.temperature_c) ||
      typeof data.humidity_pct !== "number" ||
      !Number.isFinite(data.humidity_pct) ||
      !Number.isInteger(data.occupied_slots) ||
      (data.occupied_slots as number) < 0 ||
      (data.available_slots !== undefined &&
        (!Number.isInteger(data.available_slots) ||
          (data.available_slots as number) < 0)) ||
      (data.door_open !== null && typeof data.door_open !== "boolean") ||
      (data.system_enabled !== null && typeof data.system_enabled !== "boolean") ||
      (data.sensor_ok !== null && typeof data.sensor_ok !== "boolean") ||
      typeof data.recorded_at !== "string" ||
      !Number.isFinite(Date.parse(data.recorded_at))
    ) {
      return null;
    }
    return { type: "telemetry", telemetry: data as unknown as MqttTelemetry };
  }

  if (suffix === "alarmas/critica") {
    if (
      data.severity !== "critical" ||
      typeof data.kind !== "string" ||
      typeof data.message !== "string" ||
      typeof data.occurred_at !== "string" ||
      (data.value !== null && typeof data.value !== "number")
    ) {
      return null;
    }
    return {
      type: "alarm",
      alarm: {
        kind: data.kind,
        severity: data.severity,
        message: data.message,
        value: data.value,
        occurred_at: data.occurred_at,
      },
    };
  }

  if (suffix === "sistema/estado") {
    if (
      typeof data.locked !== "boolean" ||
      (data.reason !== null && typeof data.reason !== "string") ||
      typeof data.recorded_at !== "string"
    ) {
      return null;
    }
    return {
      type: "system",
      system: { locked: data.locked, reason: data.reason, recorded_at: data.recorded_at },
    };
  }

  if (suffix === "vision/resultado") {
    if (
      typeof data.clase !== "string" ||
      typeof data.confianza !== "number" ||
      !Number.isInteger(data.votos_objeto) ||
      !Number.isInteger(data.ventana) ||
      typeof data.objeto_detectado !== "boolean" ||
      typeof data.recorded_at !== "string"
    ) {
      return null;
    }
    return {
      type: "vision",
      vision: {
        clase: data.clase,
        confianza: data.confianza,
        votos_objeto: data.votos_objeto as number,
        ventana: data.ventana as number,
        objeto_detectado: data.objeto_detectado,
        recorded_at: data.recorded_at,
      },
    };
  }

  if (suffix === "actuadores/estado") {
    if (
      typeof data.heater !== "boolean" ||
      typeof data.fan !== "boolean" ||
      typeof data.buzzer !== "boolean" ||
      (data.servo_angle !== null && typeof data.servo_angle !== "number") ||
      typeof data.recorded_at !== "string"
    ) {
      return null;
    }
    return {
      type: "actuators",
      actuators: {
        heater: data.heater,
        fan: data.fan,
        servo_angle: data.servo_angle,
        buzzer: data.buzzer,
        recorded_at: data.recorded_at,
      },
    };
  }

  return null;
}
