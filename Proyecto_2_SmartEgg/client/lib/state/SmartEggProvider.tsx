"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import mqtt from "mqtt";

import {
  ApiError,
  api,
  rfidAccessWebsocketUrl,
  websocketUrl,
} from "@/lib/api/client";
import type {
  Alarm,
  AuthToken,
  DashboardState,
  DiagnosticSummary,
  DoorEvent,
  DoorEventCreate,
  Egg,
  EggCreate,
  Incubator,
  IncubatorConfig,
  IncubatorConfigUpdate,
  Lot,
  LotCreate,
  ReportExport,
  RfidAccessMessage,
  RotationEvent,
  Technician,
  TechnicianCreate,
  TechnicianWithAssignments,
  TelemetryReading,
  WebSocketMessage,
} from "@/lib/api/types";
import {
  parseMqttMessage,
  type MqttActuatorState,
  type MqttCriticalAlarm,
} from "@/lib/mqtt/messages";
import { mqttWebSocketUrl } from "@/lib/mqtt/url";
import { canNavigate, canOpenDoor } from "@/lib/auth/permissions";
import { createDemoState, DEMO_AVAILABLE } from "./demo";
import type {
  ComponentId,
  EggView,
  ScreenId,
  Selection,
  SeriesPoint,
  SmartEggConfig,
} from "@/lib/smartegg/types";

const TOKEN_KEY = "smartegg.access-token";
const ALARM_SOUND_PATH = "/sounds/critical-alarm.mp3";
const SERIES_LIMIT = 240;
const FALLBACK_POLL_MS = 2_000;
const LIVE_REFRESH_MS = 10_000;

interface ConsoleState {
  screen: ScreenId;
  selection: Selection;
  hoveredEgg: string | null;
  registrationSlot: number | null;
  doorOperationOpen: boolean;
}

type ConsoleAction =
  | { type: "navigate"; screen: ScreenId }
  | { type: "select"; selection: Exclude<Selection, null> }
  | { type: "clearSelection" }
  | { type: "openRegistration"; slot: number }
  | { type: "closeRegistration" }
  | { type: "openDoorOperation" }
  | { type: "closeDoorOperation" }
  | { type: "hover"; egg: string | null };

const INITIAL_STATE: ConsoleState = {
  screen: "control",
  selection: null,
  hoveredEgg: null,
  registrationSlot: null,
  doorOperationOpen: false,
};

function reducer(state: ConsoleState, action: ConsoleAction): ConsoleState {
  switch (action.type) {
    case "navigate":
      return { ...state, screen: action.screen, selection: null };
    case "select":
      return { ...state, selection: action.selection };
    case "clearSelection":
      return { ...state, selection: null };
    case "openRegistration":
      return { ...state, registrationSlot: action.slot, selection: null };
    case "closeRegistration":
      return { ...state, registrationSlot: null };
    case "openDoorOperation":
      return { ...state, doorOperationOpen: true, selection: null };
    case "closeDoorOperation":
      return { ...state, doorOperationOpen: false };
    case "hover":
      return { ...state, hoveredEgg: action.egg };
    default:
      return state;
  }
}

export type ConnectionStatus =
  | "connecting"
  | "live"
  | "polling"
  | "offline";

export type RfidConnectionStatus =
  | "disabled"
  | "connecting"
  | "ready"
  | "authorized"
  | "offline";

export interface SmartEggActions {
  navigate: (screen: ScreenId) => void;
  selectComponent: (id: ComponentId) => void;
  pickEgg: (egg: Pick<EggView, "id" | "empty" | "registered">) => void;
  hoverEgg: (id: string | null) => void;
  clearSelection: () => void;
  openEggRegistration: (slot: number) => void;
  closeEggRegistration: () => void;
  openDoorOperation: () => void;
  closeDoorOperation: () => void;
  toggleAlarmSound: () => void;
  testAlarmSound: () => void;
  login: (username: string, password: string) => Promise<void>;
  enterDemo: () => void;
  logout: () => void;
  refresh: () => Promise<void>;
  downloadDailyReport: (day?: string, operatorId?: number) => Promise<string>;
  refreshRoleData: (operatorId?: number) => Promise<void>;
  createTechnician: (
    payload: TechnicianCreate,
    incubatorIds: number[],
  ) => Promise<void>;
  setTechnicianActive: (technicianId: number, active: boolean) => Promise<void>;
  assignTechnician: (technicianId: number, incubatorIds: number[]) => Promise<void>;
  updateIncubatorConfig: (
    payload: IncubatorConfigUpdate,
  ) => Promise<IncubatorConfig>;
  createLot: (payload: LotCreate) => Promise<Lot>;
  registerEgg: (payload: EggCreate) => Promise<Egg>;
  createDoorEvent: (payload: DoorEventCreate) => Promise<DoorEvent>;
}

export interface SmartEggContextValue extends ConsoleState {
  config: SmartEggConfig;
  critical: boolean;
  hydrated: boolean;
  demoActive: boolean;
  technician: Technician | null;
  incubator: Incubator | null;
  dashboard: DashboardState | null;
  lots: Lot[];
  eggs: Egg[];
  diagnostic: DiagnosticSummary | null;
  technicians: TechnicianWithAssignments[];
  reportExports: ReportExport[];
  /** Histórico de alarmas y giros de bandeja, para las gráficas. */
  alarmHistory: Alarm[];
  rotationHistory: RotationEvent[];
  adminExists: boolean;
  connection: ConnectionStatus;
  mqttConnected: boolean;
  nodeOnline: boolean | null;
  criticalAlarm: MqttCriticalAlarm | null;
  alarmSoundEnabled: boolean;
  alarmSoundBlocked: boolean;
  error: string | null;
  loginPending: boolean;
  rfidConnection: RfidConnectionStatus;
  accessMessage: string | null;
  actions: SmartEggActions;
}

export interface TelemetryContextValue {
  series: SeriesPoint[];
  latest: SeriesPoint | null;
  recordedAt: string | null;
  clock: string;
}

export const SmartEggContext = createContext<SmartEggContextValue | null>(null);
export const TelemetryContext = createContext<TelemetryContextValue | null>(null);

function point(reading: TelemetryReading): SeriesPoint {
  return {
    t: reading.temperature_c,
    h: reading.humidity_pct,
    o: reading.occupied_slots,
    recordedAt: reading.recorded_at,
  };
}

function clockFor(recordedAt: string | null): string {
  if (!recordedAt) return "--:--:--";
  return new Intl.DateTimeFormat("es-GT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(recordedAt));
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible conectar con el backend";
}

function updateActuators(
  current: DashboardState,
  next: MqttActuatorState,
): DashboardState {
  return {
    ...current,
    actuators: current.actuators.map((actuator) => {
      if (actuator.kind === "servo") {
        return {
          ...actuator,
          enabled: next.servo_angle !== null,
          value: next.servo_angle,
          updated_at: next.recorded_at,
        };
      }
      const enabled = next[actuator.kind];
      return {
        ...actuator,
        enabled,
        updated_at: next.recorded_at,
      };
    }),
  };
}

export function SmartEggProvider({
  config,
  children,
}: {
  config: SmartEggConfig;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [technician, setTechnician] = useState<Technician | null>(null);
  const [incubator, setIncubator] = useState<Incubator | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [eggs, setEggs] = useState<Egg[]>([]);
  const [diagnostic, setDiagnostic] = useState<DiagnosticSummary | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianWithAssignments[]>([]);
  const [reportExports, setReportExports] = useState<ReportExport[]>([]);
  const [adminExists, setAdminExists] = useState(true);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [alarmHistory, setAlarmHistory] = useState<Alarm[]>([]);
  const [rotationHistory, setRotationHistory] = useState<RotationEvent[]>([]);
  const [connection, setConnection] =
    useState<ConnectionStatus>("connecting");
  const [mqttConnected, setMqttConnected] = useState(false);
  const [nodeOnline, setNodeOnline] = useState<boolean | null>(null);
  const [criticalAlarm, setCriticalAlarm] =
    useState<MqttCriticalAlarm | null>(null);
  const [alarmSoundEnabled, setAlarmSoundEnabled] = useState(true);
  const [alarmSoundBlocked, setAlarmSoundBlocked] = useState(false);
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const connectionRef = useRef<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);
  const [rfidConnection, setRfidConnection] = useState<RfidConnectionStatus>(
    process.env.NEXT_PUBLIC_ACCESS_KIOSK_KEY ? "connecting" : "disabled",
  );
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const mqttNodeCode = incubator?.code;
  const mqttIncubatorId = incubator?.id;
  const mqttCapacity = incubator?.capacity;

  useEffect(() => {
    const audio = new Audio(ALARM_SOUND_PATH);
    audio.preload = "auto";
    audio.volume = 0.7;
    alarmAudioRef.current = audio;
    return () => {
      audio.pause();
      alarmAudioRef.current = null;
    };
  }, []);

  const playAlarmSound = useCallback(async () => {
    const audio = alarmAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    try {
      await audio.play();
      setAlarmSoundBlocked(false);
    } catch {
      setAlarmSoundBlocked(true);
    }
  }, []);

  const toggleAlarmSound = useCallback(() => {
    const audio = alarmAudioRef.current;
    if (alarmSoundBlocked || !alarmSoundEnabled) {
      setAlarmSoundEnabled(true);
      void playAlarmSound();
      return;
    }
    setAlarmSoundEnabled(false);
    setAlarmSoundBlocked(false);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [alarmSoundBlocked, alarmSoundEnabled, playAlarmSound]);

  const testAlarmSound = useCallback(() => {
    setAlarmSoundEnabled(true);
    void playAlarmSound();
  }, [playAlarmSound]);

  useEffect(() => {
    const audio = alarmAudioRef.current;
    if (!criticalAlarm) {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      return;
    }
    if (alarmSoundEnabled) {
      queueMicrotask(() => void playAlarmSound());
    }
  }, [alarmSoundEnabled, criticalAlarm, playAlarmSound]);

  const updateConnection = useCallback((next: ConnectionStatus) => {
    connectionRef.current = next;
    setConnection(next);
  }, []);

  const applyReading = useCallback((reading: TelemetryReading) => {
    setDashboard((current) =>
      current &&
      (!current.latest ||
        Date.parse(reading.recorded_at) >= Date.parse(current.latest.recorded_at))
        ? { ...current, latest: reading }
        : current,
    );
    setSeries((current) => {
      const nextPoint = point(reading);
      const last = current[current.length - 1];
      if (last?.recordedAt &&
          Date.parse(last.recordedAt) >= Date.parse(nextPoint.recordedAt ?? "")) {
        return current;
      }
      return [...current, nextPoint].slice(-SERIES_LIMIT);
    });
  }, []);

  const acceptAuthentication = useCallback((response: AuthToken) => {
    window.localStorage.setItem(TOKEN_KEY, response.access_token);
    setToken(response.access_token);
    setTechnician(response.technician);
    setError(null);
  }, []);

  const logout = useCallback(() => {
    setDemoActive(false);
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setTechnician(null);
    setIncubator(null);
    setDashboard(null);
    setLots([]);
    setEggs([]);
    setDiagnostic(null);
    setTechnicians([]);
    setReportExports([]);
    setAdminExists(true);
    setSeries([]);
    setAlarmHistory([]);
    setRotationHistory([]);
    setMqttConnected(false);
    setNodeOnline(null);
    setCriticalAlarm(null);
    setError(null);
    dispatch({ type: "closeRegistration" });
    updateConnection("offline");
  }, [updateConnection]);

  const enterDemo = useCallback(() => {
    if (!DEMO_AVAILABLE) return;
    const demo = createDemoState();
    setDemoActive(true);
    setTechnician(demo.technician);
    setIncubator(demo.incubator);
    setDashboard(demo.dashboard);
    setLots(demo.lots);
    setEggs(demo.eggs);
    setSeries(demo.series);
    setAlarmHistory(demo.alarms);
    setRotationHistory(demo.rotations);
    setError(null);
    setAccessMessage(null);
    updateConnection("offline");
  }, [updateConnection]);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      queueMicrotask(() => {
        setHydrated(true);
        updateConnection("offline");
      });
      return;
    }
    queueMicrotask(() => setToken(stored));
    api
      .me(stored)
      .then(setTechnician)
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setHydrated(true));
  }, [updateConnection]);

  useEffect(() => {
    if (!hydrated || technician || demoActive) return;
    const kioskKey = process.env.NEXT_PUBLIC_ACCESS_KIOSK_KEY;
    const incubatorCode =
      process.env.NEXT_PUBLIC_INCUBATOR_CODE?.trim() || "NODE-01";
    if (!kioskKey) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    const connect = () => {
      if (disposed) return;
      setRfidConnection("connecting");
      socket = new WebSocket(rfidAccessWebsocketUrl(incubatorCode, kioskKey));
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as RfidAccessMessage;
          if (message.type === "rfid_ready") {
            setRfidConnection("ready");
            return;
          }
          if (message.type === "rfid_authenticated") {
            setRfidConnection("authorized");
            setAccessMessage(
              `Acceso RFID autorizado para ${message.technician.full_name}`,
            );
            acceptAuthentication(message);
          }
        } catch {
          setRfidConnection("offline");
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (disposed) return;
        setRfidConnection("offline");
        retryTimer = window.setTimeout(connect, 3_000);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [acceptAuthentication, demoActive, hydrated, technician]);

  const refresh = useCallback(async () => {
    if (demoActive) return;
    if (!token) return;
    if (!incubator) {
      const items = await api.incubators(token);
      const selected = items[0];
      if (!selected) {
        throw new Error(
          "No hay incubadoras registradas. Cree una desde Swagger antes de continuar.",
        );
      }
      setIncubator(selected);
      setError(null);
      return;
    }
    const [next, nextLots, nextEggs] = await Promise.all([
      api.state(incubator.id, token),
      api.lots(token),
      api.eggs(incubator.id, token),
    ]);
    setDashboard((current) =>
      current?.latest &&
      (!next.latest ||
        Date.parse(current.latest.recorded_at) > Date.parse(next.latest.recorded_at))
        ? { ...next, latest: current.latest }
        : next,
    );
    setLots(nextLots);
    setEggs(nextEggs);
    if (next.latest) applyReading(next.latest);
    setError(null);
  }, [applyReading, demoActive, incubator, token]);

  useEffect(() => {
    if (demoActive || !token || !technician) return;
    let cancelled = false;

    api
      .incubators(token)
      .then((items) => {
        if (cancelled) return;
        const requested = Number(process.env.NEXT_PUBLIC_INCUBATOR_ID);
        const selected =
          items.find((item) => Number.isFinite(requested) && item.id === requested) ??
          items[0];
        if (!selected) {
          throw new Error(
            "No hay incubadoras registradas. Cree una desde Swagger antes de continuar.",
          );
        }
        setIncubator(selected);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(errorMessage(reason));
          updateConnection("offline");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [demoActive, technician, token, updateConnection]);

  useEffect(() => {
    if (demoActive || !token || !technician || incubator) return;
    let disposed = false;
    const retry = window.setInterval(() => {
      api
        .incubators(token)
        .then((items) => {
          if (disposed || !items[0]) return;
          setIncubator(items[0]);
          setError(null);
          updateConnection("connecting");
        })
        .catch(() => {
          // The access screen keeps the last useful error while the API starts.
        });
    }, FALLBACK_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(retry);
    };
  }, [demoActive, incubator, technician, token, updateConnection]);

  useEffect(() => {
    if (demoActive || !token || !incubator) return;
    let cancelled = false;
    Promise.all([
      api.state(incubator.id, token),
      api.telemetry(incubator.id, token),
      api.lots(token),
      api.eggs(incubator.id, token),
    ])
      .then(([nextDashboard, history, nextLots, nextEggs]) => {
        if (cancelled) return;
        setDashboard((current) =>
          current?.latest &&
          (!nextDashboard.latest ||
            Date.parse(current.latest.recorded_at) >
              Date.parse(nextDashboard.latest.recorded_at))
            ? { ...nextDashboard, latest: current.latest }
            : nextDashboard,
        );
        setSeries(history.slice().reverse().map(point));
        setLots(nextLots);
        setEggs(nextEggs);
        setError(null);
        updateConnection("polling");
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(errorMessage(reason));
          updateConnection("offline");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [demoActive, incubator, token, updateConnection]);

  // Se vuelve a pedir cuando cambian las alarmas activas o el ángulo de la
  // bandeja: MQTT avisa del cambio y la base de datos tiene el registro.
  const activeAlarmKey = dashboard?.active_alarms
    .map((alarm) => `${alarm.id}:${alarm.severity}`)
    .join(",");
  const servoAngle = dashboard?.actuators.find((a) => a.kind === "servo")?.value;
  useEffect(() => {
    if (demoActive || !token || !incubator) return;
    let cancelled = false;
    Promise.all([
      api.alarms(incubator.id, token),
      api.rotations(incubator.id, token),
    ])
      .then(([alarms, rotations]) => {
        if (cancelled) return;
        setAlarmHistory(alarms);
        setRotationHistory(rotations);
      })
      .catch(() => {
        // Las gráficas muestran su estado vacío; el resto de la consola sigue.
      });
    return () => {
      cancelled = true;
    };
  }, [activeAlarmKey, criticalAlarm, demoActive, incubator, servoAngle, token]);

  useEffect(() => {
    if (demoActive || !token || !incubator) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(websocketUrl(incubator.id, token));
      socket.onopen = () => {
        setError(null);
        updateConnection("live");
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as WebSocketMessage;
          if (message.type === "telemetry") {
            applyReading(message.data);
          } else if (
            (message.type === "door_closed" ||
              message.type === "access_cancelled") &&
            message.session_closed
          ) {
            logout();
            setAccessMessage(
              message.type === "door_closed"
                ? "Puerta cerrada · sesión RFID finalizada"
                : "Acceso cancelado · vuelve a acercar tu tarjeta",
            );
          }
        } catch {
          setError("El backend envió un mensaje en tiempo real no válido");
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (disposed) return;
        updateConnection("polling");
        retryTimer = window.setTimeout(connect, 3_000);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [applyReading, demoActive, incubator, logout, token, updateConnection]);

  useEffect(() => {
    if (demoActive || !token || !mqttNodeCode || !mqttIncubatorId || !mqttCapacity) return;

    const mqttClient = mqtt.connect(mqttWebSocketUrl(), {
      clientId: `smartegg-web-${mqttNodeCode}-${Math.random().toString(16).slice(2, 10)}`,
      username: process.env.NEXT_PUBLIC_MQTT_USERNAME,
      password: process.env.NEXT_PUBLIC_MQTT_PASSWORD,
      clean: true,
      connectTimeout: 10_000,
      reconnectPeriod: 2_000,
      protocolVersion: 4,
    });
    const prefix = `smartegg/${mqttNodeCode}`;

    mqttClient.on("connect", () => {
      mqttClient.subscribe(
        {
          [`${prefix}/alarmas/critica`]: { qos: 1 },
          [`${prefix}/status`]: { qos: 1 },
          [`${prefix}/actuadores/estado`]: { qos: 1 },
          [`${prefix}/telemetria`]: { qos: 0 },
        },
        (reason) => setMqttConnected(!reason),
      );
    });
    mqttClient.on("message", (topic, payload) => {
      const message = parseMqttMessage(topic, payload, mqttNodeCode);
      if (!message) return;

      if (message.type === "status") {
        setNodeOnline(message.online);
        setIncubator((current) =>
          current ? { ...current, is_online: message.online } : current,
        );
      } else if (message.type === "telemetry") {
        const reading = message.telemetry;
        if (reading.occupied_slots > mqttCapacity) return;
        applyReading({
          id: -1,
          incubator_id: mqttIncubatorId,
          temperature_c: reading.temperature_c,
          humidity_pct: reading.humidity_pct,
          door_open: reading.door_open,
          system_enabled: reading.system_enabled,
          sensor_ok: reading.sensor_ok,
          occupied_slots: reading.occupied_slots,
          available_slots: reading.available_slots ??
            Math.max(0, mqttCapacity - reading.occupied_slots),
          source: "serial",
          recorded_at: reading.recorded_at,
        });
      } else if (message.type === "alarm") {
        setCriticalAlarm(message.alarm);
        if (message.alarm === null) {
          setDashboard((current) =>
            current
              ? {
                  ...current,
                  active_alarms: current.active_alarms.filter(
                    (alarm) => alarm.severity !== "critical",
                  ),
                }
              : current,
          );
        }
      } else {
        setDashboard((current) =>
          current ? updateActuators(current, message.actuators) : current,
        );
      }
    });
    mqttClient.on("reconnect", () => setMqttConnected(false));
    mqttClient.on("offline", () => setMqttConnected(false));
    mqttClient.on("close", () => setMqttConnected(false));
    mqttClient.on("error", () => setMqttConnected(false));

    return () => {
      setMqttConnected(false);
      void mqttClient.endAsync(true);
    };
  }, [applyReading, demoActive, mqttCapacity, mqttIncubatorId, mqttNodeCode, token]);

  useEffect(() => {
    if (demoActive || !token || !incubator) return;
    let disposed = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        await refresh();
        if (connectionRef.current !== "live") updateConnection("polling");
      } catch (reason) {
        setError(errorMessage(reason));
        if (connectionRef.current !== "live") updateConnection("offline");
      } finally {
        if (!disposed) {
          timer = window.setTimeout(
            poll,
            connectionRef.current === "live"
              ? LIVE_REFRESH_MS
              : FALLBACK_POLL_MS,
          );
        }
      }
    };

    timer = window.setTimeout(poll, FALLBACK_POLL_MS);
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [demoActive, incubator, refresh, token, updateConnection]);

  const login = useCallback(async (username: string, password: string) => {
    setLoginPending(true);
    setError(null);
    try {
      const response = await api.login(username, password);
      setAccessMessage(null);
      acceptAuthentication(response);
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setLoginPending(false);
    }
  }, [acceptAuthentication]);

  const refreshRoleData = useCallback(
    async (operatorId?: number) => {
      if (demoActive || !token || !technician) return;
      const [nextDiagnostic, nextReports, nextTechnicians, nextAdminStatus] =
        await Promise.all([
        technician.role === "admin"
          ? api.adminDiagnostics(token, operatorId)
          : api.diagnostics(token),
        api.reportExports(token),
        technician.role === "admin" ? api.technicians(token) : Promise.resolve([]),
        api.adminStatus(token),
      ]);
      setDiagnostic(nextDiagnostic);
      setReportExports(nextReports);
      setTechnicians(nextTechnicians);
      setAdminExists(nextAdminStatus.exists);
    },
    [demoActive, technician, token],
  );

  useEffect(() => {
    if (!technician || !token || demoActive) return;
    let cancelled = false;
    queueMicrotask(() => {
      void refreshRoleData().catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [demoActive, refreshRoleData, technician, token]);

  const downloadDailyReport = useCallback(
    async (day?: string, operatorId?: number) => {
      if (demoActive) {
        throw new Error("El PDF real requiere backend; estás en modo demo.");
      }
      if (!token || !incubator) {
        throw new Error("No hay una incubadora autenticada para generar el reporte");
      }
      const { blob, filename } = await api.dailyReport(
        incubator.id,
        token,
        day,
        operatorId,
      );
      await refreshRoleData(operatorId);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
      return filename;
    },
    [demoActive, incubator, refreshRoleData, token],
  );

  const createTechnician = useCallback(
    async (payload: TechnicianCreate, incubatorIds: number[]) => {
      if (
        !token ||
        !technician ||
        (technician.role !== "admin" && payload.role !== "admin")
      ) {
        throw new Error("Solo el administrador puede crear perfiles");
      }
      const created = await api.createTechnician(payload, token);
      if (technician.role !== "admin") {
        setAdminExists(true);
        return;
      }
      if (created.role !== "admin") {
        await api.assignTechnician(created.id, incubatorIds, token);
      }
      await refreshRoleData();
    },
    [refreshRoleData, technician, token],
  );

  const setTechnicianActive = useCallback(
    async (technicianId: number, active: boolean) => {
      if (!token || technician?.role !== "admin") {
        throw new Error("Solo el administrador puede modificar perfiles");
      }
      await api.updateTechnician(technicianId, { is_active: active }, token);
      await refreshRoleData();
    },
    [refreshRoleData, technician, token],
  );

  const assignTechnician = useCallback(
    async (technicianId: number, incubatorIds: number[]) => {
      if (!token || technician?.role !== "admin") {
        throw new Error("Solo el administrador puede asignar incubadoras");
      }
      await api.assignTechnician(technicianId, incubatorIds, token);
      await refreshRoleData();
    },
    [refreshRoleData, technician, token],
  );

  const updateIncubatorConfig = useCallback(
    async (payload: IncubatorConfigUpdate) => {
      if (demoActive && dashboard) {
        const updated = { ...dashboard.config, ...payload, updated_at: new Date().toISOString() };
        setDashboard((current) => current ? { ...current, config: updated } : current);
        return updated;
      }
      if (!token || !incubator) {
        throw new Error("No hay una incubadora autenticada para configurar");
      }
      const updated = await api.updateConfig(incubator.id, payload, token);
      setDashboard((current) =>
        current ? { ...current, config: updated } : current,
      );
      setError(null);
      return updated;
    },
    [dashboard, demoActive, incubator, token],
  );

  const createLot = useCallback(
    async (payload: LotCreate) => {
      if (demoActive) {
        const created: Lot = {
          id: Date.now(), ...payload, origin: payload.origin ?? null,
          expected_hatch_on: payload.expected_hatch_on ?? null,
          notes: payload.notes ?? null, status: "active",
          created_at: new Date().toISOString(), egg_count: 0,
        };
        setLots((current) => [created, ...current]);
        return created;
      }
      if (!token) throw new Error("No hay una sesión autenticada");
      const created = await api.createLot(payload, token);
      setLots((current) => [created, ...current]);
      return created;
    },
    [demoActive, token],
  );

  const registerEgg = useCallback(
    async (payload: EggCreate) => {
      if (demoActive) {
        const created: Egg = {
          id: Date.now(), code: payload.code, lot_id: payload.lot_id,
          incubator_id: payload.incubator_id, slot_number: payload.slot_number,
          registered_at: payload.registered_at ?? new Date().toISOString(),
          status: "incubating", notes: payload.notes ?? null,
        };
        setEggs((current) => [...current, created]);
        return created;
      }
      if (!token || !incubator) {
        throw new Error("No hay una incubadora autenticada");
      }
      if (payload.incubator_id !== incubator.id) {
        throw new Error("La posición no pertenece a la incubadora activa");
      }
      const created = await api.registerEgg(payload, token);
      setEggs((current) => [
        ...current.filter((egg) => egg.id !== created.id),
        created,
      ]);
      setDashboard((current) =>
        current
          ? {
              ...current,
              occupancy: {
                ...current.occupancy,
                occupied: current.occupancy.occupied + 1,
                available: Math.max(0, current.occupancy.available - 1),
              },
            }
          : current,
      );
      return created;
    },
    [demoActive, incubator, token],
  );

  const createDoorEvent = useCallback(
    async (payload: DoorEventCreate) => {
      if (demoActive) {
        return {
          id: Date.now(), incubator_id: incubator?.id ?? 1,
          operator_id: technician?.id ?? 1, access_session_id: null,
          access_method: "password" as const, event_type: payload.event_type,
          opened_at: new Date().toISOString(), closed_at: null,
          eggs_added: payload.eggs_added, eggs_removed: payload.eggs_removed,
          notes: payload.notes ?? null, created_at: new Date().toISOString(),
        };
      }
      if (!token || !incubator) {
        throw new Error("No hay una sesión activa para operar la puerta");
      }
      return api.createDoorEvent(incubator.id, payload, token);
    },
    [demoActive, incubator, technician, token],
  );

  const actions = useMemo<SmartEggActions>(
    () => ({
      navigate: (screen) => {
        if (!technician || canNavigate(technician.role, screen)) {
          dispatch({ type: "navigate", screen });
        }
      },
      selectComponent: (id) =>
        dispatch({ type: "select", selection: { type: "component", id } }),
      pickEgg: (egg) =>
        egg.empty || egg.registered
          ? dispatch({
              type: "select",
              selection: egg.empty
                ? { type: "slot", id: egg.id }
                : { type: "egg", id: egg.id },
            })
          : dispatch({
              type: "openRegistration",
              slot: Number(egg.id.replace("slot-", "")),
            }),
      hoverEgg: (egg) => dispatch({ type: "hover", egg }),
      clearSelection: () => dispatch({ type: "clearSelection" }),
      openEggRegistration: (slot) =>
        dispatch({ type: "openRegistration", slot }),
      closeEggRegistration: () => dispatch({ type: "closeRegistration" }),
      openDoorOperation: () => {
        if (technician && canOpenDoor(technician.role)) {
          dispatch({ type: "openDoorOperation" });
        }
      },
      closeDoorOperation: () => dispatch({ type: "closeDoorOperation" }),
      toggleAlarmSound,
      testAlarmSound,
      login,
      enterDemo,
      logout,
      refresh,
      downloadDailyReport,
      refreshRoleData,
      createTechnician,
      setTechnicianActive,
      assignTechnician,
      updateIncubatorConfig,
      createLot,
      registerEgg,
      createDoorEvent,
    }),
    [
      createLot,
      createDoorEvent,
      createTechnician,
      downloadDailyReport,
      enterDemo,
      login,
      logout,
      refresh,
      refreshRoleData,
      registerEgg,
      updateIncubatorConfig,
      assignTechnician,
      setTechnicianActive,
      technician,
      testAlarmSound,
      toggleAlarmSound,
    ],
  );

  const effectiveConfig = useMemo<SmartEggConfig>(
    () => ({
      ...config,
      technician: technician?.full_name.toUpperCase() ?? config.technician,
    }),
    [config, technician],
  );
  const critical =
    config.criticalMode ||
    criticalAlarm !== null ||
    Boolean(
      dashboard?.active_alarms.some((alarm) => alarm.severity === "critical"),
    );

  const consoleValue = useMemo<SmartEggContextValue>(
    () => ({
      ...state,
      config: effectiveConfig,
      critical,
      hydrated,
      demoActive,
      technician,
      incubator,
      dashboard,
      lots,
      eggs,
      diagnostic,
      technicians,
      reportExports,
      alarmHistory,
      rotationHistory,
      adminExists,
      connection,
      mqttConnected,
      nodeOnline,
      criticalAlarm,
      alarmSoundEnabled,
      alarmSoundBlocked,
      error,
      loginPending,
      rfidConnection,
      accessMessage,
      actions,
    }),
    [
      state,
      effectiveConfig,
      critical,
      hydrated,
      demoActive,
      technician,
      incubator,
      dashboard,
      lots,
      eggs,
      diagnostic,
      technicians,
      reportExports,
      alarmHistory,
      rotationHistory,
      adminExists,
      connection,
      mqttConnected,
      nodeOnline,
      criticalAlarm,
      alarmSoundEnabled,
      alarmSoundBlocked,
      error,
      loginPending,
      rfidConnection,
      accessMessage,
      actions,
    ],
  );

  const latestReading = dashboard?.latest ?? null;
  const telemetryValue = useMemo<TelemetryContextValue>(
    () => ({
      series,
      latest: latestReading ? point(latestReading) : null,
      recordedAt: latestReading?.recorded_at ?? null,
      clock: clockFor(latestReading?.recorded_at ?? null),
    }),
    [latestReading, series],
  );

  return (
    <SmartEggContext.Provider value={consoleValue}>
      <TelemetryContext.Provider value={telemetryValue}>
        {children}
      </TelemetryContext.Provider>
    </SmartEggContext.Provider>
  );
}
