import type {
  DashboardState,
  Egg,
  Incubator,
  Lot,
  Technician,
  TelemetryReading,
} from "@/lib/api/types";
import type { SeriesPoint } from "@/lib/smartegg/types";

export const DEMO_AVAILABLE = process.env.NODE_ENV === "development";

export function createDemoState() {
  const now = new Date();
  const recordedAt = now.toISOString();
  const technician: Technician = {
    id: 1,
    username: "demo",
    full_name: "Operador de demostración",
    age: null,
    gender: null,
    role: "operator_1",
    rfid_uid: null,
    is_active: true,
    created_at: recordedAt,
  };
  const incubator: Incubator = {
    id: 1,
    code: "DEMO-01",
    name: "Incubadora de demostración",
    capacity: 4,
    serial_number: "SIMULADO",
    is_online: false,
    last_seen_at: null,
    created_at: recordedAt,
  };
  const series: SeriesPoint[] = Array.from({ length: 120 }, (_, index) => {
    const phase = index / 9;
    return {
      t: Math.round((37.5 + Math.sin(phase) * 0.25) * 10) / 10,
      h: Math.round((58 + Math.cos(phase / 2) * 3) * 10) / 10,
      recordedAt: new Date(now.getTime() - (119 - index) * 120_000).toISOString(),
    };
  });
  const current = series[series.length - 1];
  const latest: TelemetryReading = {
    id: 120,
    incubator_id: incubator.id,
    temperature_c: current.t,
    humidity_pct: current.h,
    door_open: false,
    occupied_slots: 3,
    available_slots: 1,
    source: "demo",
    recorded_at: current.recordedAt ?? recordedAt,
  };
  const dashboard: DashboardState = {
    incubator,
    config: {
      incubator_id: incubator.id,
      temperature_min_c: 37,
      temperature_max_c: 38,
      humidity_min_pct: 50,
      humidity_max_pct: 65,
      critical_temperature_c: 39,
      rotation_interval_seconds: 120,
      rotation_angle_degrees: 45,
      updated_at: recordedAt,
    },
    latest,
    occupancy: { capacity: 4, occupied: 3, available: 1 },
    sensors: [
      { id: 1, incubator_id: 1, code: "DHT-T", kind: "temperature", unit: "°C", is_active: true, last_value: current.t, last_reading_at: recordedAt },
      { id: 2, incubator_id: 1, code: "DHT-H", kind: "humidity", unit: "%", is_active: true, last_value: current.h, last_reading_at: recordedAt },
    ],
    actuators: [
      { id: 1, incubator_id: 1, kind: "heater", enabled: false, mode: "automatic", value: null, updated_at: recordedAt },
      { id: 2, incubator_id: 1, kind: "fan", enabled: false, mode: "automatic", value: null, updated_at: recordedAt },
      { id: 3, incubator_id: 1, kind: "servo", enabled: true, mode: "automatic", value: 45, updated_at: recordedAt },
      { id: 4, incubator_id: 1, kind: "buzzer", enabled: false, mode: "automatic", value: null, updated_at: recordedAt },
    ],
    active_alarms: [],
  };
  const lots: Lot[] = [{
    id: 1,
    code: "LOTE-DEMO",
    species: "Gallina",
    origin: "Demostración",
    started_on: now.toISOString().slice(0, 10),
    expected_hatch_on: null,
    status: "active",
    notes: null,
    created_at: recordedAt,
    egg_count: 2,
  }];
  const eggs: Egg[] = [1, 2].map((position) => ({
    id: position,
    code: `H-DEMO-${String(position).padStart(3, "0")}`,
    lot_id: 1,
    incubator_id: 1,
    slot_number: position,
    registered_at: recordedAt,
    status: "incubating",
    notes: null,
  }));
  return { technician, incubator, dashboard, lots, eggs, series };
}
