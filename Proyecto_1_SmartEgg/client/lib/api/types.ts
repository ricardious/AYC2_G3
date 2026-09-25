export interface Technician {
  id: number;
  username: string;
  full_name: string;
  age: number | null;
  gender: string | null;
  role: "operator" | "admin";
  rfid_uid: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TechnicianWithAssignments extends Technician {
  incubator_ids: number[];
}

export interface TechnicianCreate {
  username: string;
  full_name: string;
  age?: number | null;
  gender?: string | null;
  role: "operator" | "admin";
  rfid_uid?: string | null;
  password: string;
}

export interface AdminStatus {
  exists: boolean;
}

export interface DiagnosticSummary {
  operator_id: number | null;
  operator_name: string;
  role: string;
  from_at: string;
  to_at: string;
  incubator_ids: number[];
  telemetry_samples: number;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  temperature_avg_c: number | null;
  humidity_min_pct: number | null;
  humidity_max_pct: number | null;
  humidity_avg_pct: number | null;
  access_sessions: number;
  door_events: number;
  eggs_added: number;
  eggs_removed: number;
  registered_eggs: number;
  acknowledged_alarms: number;
  generated_reports: number;
}

export interface ReportExport {
  id: number;
  incubator_id: number;
  generated_by_id: number;
  subject_operator_id: number | null;
  scope: "personal" | "operator" | "global";
  report_day: string;
  generated_at: string;
}

export interface AuthToken {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  technician: Technician;
  session_id?: number | null;
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
  created_by_id?: number | null;
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
  registered_by_id?: number | null;
}

export interface EggCreate {
  code: string;
  lot_id: number;
  incubator_id: number;
  slot_number: number;
  registered_at?: string | null;
  notes?: string | null;
}

export type DoorEventType =
  | "egg_entry"
  | "egg_removal"
  | "inspection"
  | "maintenance";

export interface DoorEventCreate {
  event_type: DoorEventType;
  eggs_added: number;
  eggs_removed: number;
  notes?: string | null;
}

export interface DoorEvent {
  id: number;
  incubator_id: number;
  operator_id: number;
  access_session_id: number | null;
  access_method: "rfid" | "fingerprint" | "key" | "password";
  event_type: DoorEventType;
  opened_at: string;
  closed_at: string | null;
  eggs_added: number;
  eggs_removed: number;
  notes: string | null;
  created_at: string;
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
  system_enabled?: boolean | null;
  sensor_ok?: boolean | null;
  id: number;
  incubator_id: number;
  temperature_c: number;
  humidity_pct: number;
  door_open: boolean | null;
  occupied_slots: number;
  available_slots: number;
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

export interface RotationEvent {
  id: number;
  incubator_id: number;
  angle_degrees: number;
  direction: "left" | "right" | string;
  source: string;
  performed_at: string;
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

export interface DoorAccessMessage {
  type: "door_opened" | "door_closed" | "access_cancelled";
  session_id: number;
  session_closed: boolean;
  servo_action: "unlock" | "lock";
  servo_angle: number;
}

export interface RfidReadyMessage {
  type: "rfid_ready";
  incubator_code: string;
}

export interface RfidAuthenticatedMessage extends AuthToken {
  type: "rfid_authenticated";
  session_id: number;
}

export type RfidAccessMessage = RfidReadyMessage | RfidAuthenticatedMessage;
export type WebSocketMessage =
  | LiveTelemetryMessage
  | ConnectedMessage
  | DoorAccessMessage;
