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

import { ApiError, api, websocketUrl } from "@/lib/api/client";
import type {
  DashboardState,
  Incubator,
  IncubatorConfig,
  IncubatorConfigUpdate,
  Technician,
  TelemetryReading,
  WebSocketMessage,
} from "@/lib/api/types";
import type {
  ComponentId,
  EggView,
  ScreenId,
  Selection,
  SeriesPoint,
  SmartEggConfig,
} from "@/lib/smartegg/types";

const TOKEN_KEY = "smartegg.access-token";
const SERIES_LIMIT = 240;
const FALLBACK_POLL_MS = 2_000;
const LIVE_REFRESH_MS = 10_000;

interface ConsoleState {
  screen: ScreenId;
  selection: Selection;
  hoveredEgg: string | null;
}

type ConsoleAction =
  | { type: "navigate"; screen: ScreenId }
  | { type: "select"; selection: Exclude<Selection, null> }
  | { type: "clearSelection" }
  | { type: "hover"; egg: string | null };

const INITIAL_STATE: ConsoleState = {
  screen: "control",
  selection: null,
  hoveredEgg: null,
};

function reducer(state: ConsoleState, action: ConsoleAction): ConsoleState {
  switch (action.type) {
    case "navigate":
      return { ...state, screen: action.screen, selection: null };
    case "select":
      return { ...state, selection: action.selection };
    case "clearSelection":
      return { ...state, selection: null };
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

export interface SmartEggActions {
  navigate: (screen: ScreenId) => void;
  selectComponent: (id: ComponentId) => void;
  pickEgg: (egg: Pick<EggView, "id" | "empty">) => void;
  hoverEgg: (id: string | null) => void;
  clearSelection: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  downloadDailyReport: (day?: string) => Promise<string>;
  updateIncubatorConfig: (
    payload: IncubatorConfigUpdate,
  ) => Promise<IncubatorConfig>;
}

export interface SmartEggContextValue extends ConsoleState {
  config: SmartEggConfig;
  critical: boolean;
  hydrated: boolean;
  technician: Technician | null;
  incubator: Incubator | null;
  dashboard: DashboardState | null;
  connection: ConnectionStatus;
  error: string | null;
  loginPending: boolean;
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
  return { t: reading.temperature_c, h: reading.humidity_pct };
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

export function SmartEggProvider({
  config,
  children,
}: {
  config: SmartEggConfig;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [technician, setTechnician] = useState<Technician | null>(null);
  const [incubator, setIncubator] = useState<Incubator | null>(null);
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [connection, setConnection] =
    useState<ConnectionStatus>("connecting");
  const connectionRef = useRef<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);

  const updateConnection = useCallback((next: ConnectionStatus) => {
    connectionRef.current = next;
    setConnection(next);
  }, []);

  const applyReading = useCallback((reading: TelemetryReading) => {
    setDashboard((current) =>
      current ? { ...current, latest: reading } : current,
    );
    setSeries((current) => {
      const nextPoint = point(reading);
      const last = current[current.length - 1];
      if (last?.t === nextPoint.t && last?.h === nextPoint.h) return current;
      return [...current, nextPoint].slice(-SERIES_LIMIT);
    });
  }, []);

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

  const refresh = useCallback(async () => {
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
    const next = await api.state(incubator.id, token);
    setDashboard(next);
    if (next.latest) applyReading(next.latest);
    setError(null);
  }, [applyReading, incubator, token]);

  useEffect(() => {
    if (!token || !technician) return;
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
  }, [technician, token, updateConnection]);

  useEffect(() => {
    if (!token || !technician || incubator) return;
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
  }, [incubator, technician, token, updateConnection]);

  useEffect(() => {
    if (!token || !incubator) return;
    let cancelled = false;
    Promise.all([
      api.state(incubator.id, token),
      api.telemetry(incubator.id, token),
    ])
      .then(([nextDashboard, history]) => {
        if (cancelled) return;
        setDashboard(nextDashboard);
        setSeries(history.slice().reverse().map(point));
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
  }, [incubator, token, updateConnection]);

  useEffect(() => {
    if (!token || !incubator) return;
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
          if (message.type === "telemetry") applyReading(message.data);
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
  }, [applyReading, incubator, token, updateConnection]);

  useEffect(() => {
    if (!token || !incubator) return;
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
  }, [incubator, refresh, token, updateConnection]);

  const login = useCallback(async (username: string, password: string) => {
    setLoginPending(true);
    setError(null);
    try {
      const response = await api.login(username, password);
      window.localStorage.setItem(TOKEN_KEY, response.access_token);
      setToken(response.access_token);
      setTechnician(response.technician);
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setLoginPending(false);
    }
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setTechnician(null);
    setIncubator(null);
    setDashboard(null);
    setSeries([]);
    setError(null);
    updateConnection("offline");
  }, [updateConnection]);

  const downloadDailyReport = useCallback(
    async (day?: string) => {
      if (!token || !incubator) {
        throw new Error("No hay una incubadora autenticada para generar el reporte");
      }
      const { blob, filename } = await api.dailyReport(
        incubator.id,
        token,
        day,
      );
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
    [incubator, token],
  );

  const updateIncubatorConfig = useCallback(
    async (payload: IncubatorConfigUpdate) => {
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
    [incubator, token],
  );

  const actions = useMemo<SmartEggActions>(
    () => ({
      navigate: (screen) => dispatch({ type: "navigate", screen }),
      selectComponent: (id) =>
        dispatch({ type: "select", selection: { type: "component", id } }),
      pickEgg: (egg) =>
        dispatch({
          type: "select",
          selection: egg.empty ? { type: "slot" } : { type: "egg", id: egg.id },
        }),
      hoverEgg: (egg) => dispatch({ type: "hover", egg }),
      clearSelection: () => dispatch({ type: "clearSelection" }),
      login,
      logout,
      refresh,
      downloadDailyReport,
      updateIncubatorConfig,
    }),
    [downloadDailyReport, login, logout, refresh, updateIncubatorConfig],
  );

  const effectiveConfig = useMemo<SmartEggConfig>(
    () => ({
      ...config,
      technician: technician?.full_name.toUpperCase() ?? config.technician,
    }),
    [config, technician],
  );
  const critical =
    config.criticalMode || Boolean(dashboard?.active_alarms.length);

  const consoleValue = useMemo<SmartEggContextValue>(
    () => ({
      ...state,
      config: effectiveConfig,
      critical,
      hydrated,
      technician,
      incubator,
      dashboard,
      connection,
      error,
      loginPending,
      actions,
    }),
    [
      state,
      effectiveConfig,
      critical,
      hydrated,
      technician,
      incubator,
      dashboard,
      connection,
      error,
      loginPending,
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
