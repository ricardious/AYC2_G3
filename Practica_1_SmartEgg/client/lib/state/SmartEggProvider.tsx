"use client";

import {
  createContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import {
  INITIAL_LIVE_SERIES,
  TICK_INTERVAL_MS,
  advanceSeries,
  formatClock,
} from "@/lib/smartegg/telemetry";
import type {
  ComponentId,
  EggView,
  ScreenId,
  Selection,
  SeriesPoint,
  SmartEggConfig,
} from "@/lib/smartegg/types";

/* ------------------------------------------------------------------ state */

interface ConsoleState {
  screen: ScreenId;
  selection: Selection;
  hoveredEgg: string | null;
  /** In-app alarm simulation, OR-ed with `config.criticalMode`. */
  criticalOverride: boolean;
}

type ConsoleAction =
  | { type: "navigate"; screen: ScreenId }
  | { type: "select"; selection: Exclude<Selection, null> }
  | { type: "clearSelection" }
  | { type: "hover"; egg: string | null }
  | { type: "toggleCritical" };

const INITIAL_STATE: ConsoleState = {
  screen: "control",
  selection: null,
  hoveredEgg: null,
  criticalOverride: false,
};

function reducer(state: ConsoleState, action: ConsoleAction): ConsoleState {
  switch (action.type) {
    case "navigate":
      // Changing screen drops the inspector, as in the source design.
      return { ...state, screen: action.screen, selection: null };
    case "select":
      return { ...state, selection: action.selection };
    case "clearSelection":
      return { ...state, selection: null };
    case "hover":
      return { ...state, hoveredEgg: action.egg };
    case "toggleCritical":
      return { ...state, criticalOverride: !state.criticalOverride };
    default:
      return state;
  }
}

/* ---------------------------------------------------------------- context */

export interface SmartEggActions {
  navigate: (screen: ScreenId) => void;
  selectComponent: (id: ComponentId) => void;
  /** Routes to the specimen sheet, or to the empty-slot sheet. */
  pickEgg: (egg: Pick<EggView, "id" | "empty">) => void;
  hoverEgg: (id: string | null) => void;
  clearSelection: () => void;
  toggleCritical: () => void;
}

export interface SmartEggContextValue extends ConsoleState {
  config: SmartEggConfig;
  /** Effective alarm state: the toggle or the forced prop. */
  critical: boolean;
  actions: SmartEggActions;
}

export interface TelemetryContextValue {
  /** Rolling 6 h window, refreshed every {@link TICK_INTERVAL_MS}. */
  series: SeriesPoint[];
  latest: SeriesPoint;
  clock: string;
}

export const SmartEggContext = createContext<SmartEggContextValue | null>(null);
export const TelemetryContext = createContext<TelemetryContextValue | null>(
  null,
);

/* --------------------------------------------------------------- provider */

export function SmartEggProvider({
  config,
  children,
}: {
  config: SmartEggConfig;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [series, setSeries] = useState<SeriesPoint[]>(INITIAL_LIVE_SERIES);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSeries((current) => advanceSeries(current));
      setTick((current) => current + 1);
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, []);

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
      toggleCritical: () => dispatch({ type: "toggleCritical" }),
    }),
    [],
  );

  const consoleValue = useMemo<SmartEggContextValue>(
    () => ({
      ...state,
      config,
      critical: state.criticalOverride || config.criticalMode,
      actions,
    }),
    [state, config, actions],
  );

  const telemetryValue = useMemo<TelemetryContextValue>(
    () => ({
      series,
      latest: series[series.length - 1],
      clock: formatClock(tick),
    }),
    [series, tick],
  );

  return (
    <SmartEggContext.Provider value={consoleValue}>
      <TelemetryContext.Provider value={telemetryValue}>
        {children}
      </TelemetryContext.Provider>
    </SmartEggContext.Provider>
  );
}
