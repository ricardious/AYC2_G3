"use client";

import { useContext, useMemo } from "react";

import { buildEggViews } from "@/lib/smartegg/derive";
import type { EggView } from "@/lib/smartegg/types";

import {
  SmartEggContext,
  TelemetryContext,
  type SmartEggContextValue,
  type TelemetryContextValue,
} from "./SmartEggProvider";

export function useSmartEgg(): SmartEggContextValue {
  const value = useContext(SmartEggContext);
  if (!value) {
    throw new Error("useSmartEgg must be used inside <SmartEggProvider>");
  }
  return value;
}

/**
 * Telemetry lives in its own context so the 2.2 s tick only re-renders the
 * gauges and charts, not the navigation or the inspector.
 */
export function useTelemetry(): TelemetryContextValue {
  const value = useContext(TelemetryContext);
  if (!value) {
    throw new Error("useTelemetry must be used inside <SmartEggProvider>");
  }
  return value;
}

/** Egg presentation models, shared by every screen that renders specimens. */
export function useEggViews(): EggView[] {
  const { hoveredEgg, selection } = useSmartEgg();
  return useMemo(
    () => buildEggViews(hoveredEgg, selection),
    [hoveredEgg, selection],
  );
}
