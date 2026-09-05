export interface Technician {
  id: number;
  username: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthToken {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  technician: Technician;
}

export interface Incubator {
  id: number;
  code: string;
  name: string;
  capacity: number;
  serial_number: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface Lot {
  id: number;
  code: string;
  species: string;
  origin: string | null;
  started_on: string;
  expected_hatch_on: string | null;
  status: "active" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  egg_count: number;
}

export interface LotCreate {
  code: string;
  species: string;
  origin?: string | null;
  started_on: string;
  expected_hatch_on?: string | null;
  notes?: string | null;
}

export interface Egg {
  id: number;
  code: string;
  lot_id: number;
  incubator_id: number;
  slot_number: number;
  registered_at: string;
  status: "incubating" | "hatched" | "removed" | "discarded";
  notes: string | null;
}

export interface EggCreate {
  code: string;
  lot_id: number;
  incubator_id: number;
  slot_number: number;
  registered_at?: string | null;
  notes?: string | null;
}

export interface IncubatorConfig {
  incubator_id: number;
  temperature_min_c: number;
  temperature_max_c: number;
  humidity_min_pct: number;
  humidity_max_pct: number;
  critical_temperature_c: number;
  rotation_interval_seconds: number;
  rotation_angle_degrees: number;
  updated_at: string;
}

export type IncubatorConfigUpdate = Omit<
  IncubatorConfig,
  "incubator_id" | "updated_at"
>;

export interface TelemetryReading {
  id: number;
  incubator_id: number;
  temperature_c: number;
  humidity_pct: number;
  door_open: boolean | null;
  occupied_slots: number | null;
  source: string;
  recorded_at: string;
}

export interface Occupancy {
  capacity: number;
  occupied: number;
  available: number;
}

export interface Sensor {
  id: number;
  incubator_id: number;
  code: string;
  kind: string;
  unit: string | null;
  is_active: boolean;
  last_value: number | null;
  last_reading_at: string | null;
}

export interface Actuator {
  id: number;
  incubator_id: number;
  kind: "heater" | "fan" | "servo" | "buzzer";
  enabled: boolean;
  mode: string;
  value: number | null;
  updated_at: string;
}

export interface Alarm {
  id: number;
  incubator_id: number;
  kind: string;
  severity: string;
  message: string;
  value: number | null;
  occurred_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by_id: number | null;
}

export interface DashboardState {
  incubator: Incubator;
  config: IncubatorConfig;
  latest: TelemetryReading | null;
  occupancy: Occupancy;
  sensors: Sensor[];
  actuators: Actuator[];
  active_alarms: Alarm[];
}

export interface LiveTelemetryMessage {
  type: "telemetry";
  data: TelemetryReading;
}

export interface ConnectedMessage {
  type: "connected";
  incubator_id: number;
}

export type WebSocketMessage = LiveTelemetryMessage | ConnectedMessage;
