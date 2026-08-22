"use client";

import { useContext, useMemo } from "react";

import {
  buildEggViews,
  normalizeOccupiedSlots,
} from "@/lib/smartegg/derive";
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
  const { hoveredEgg, selection, dashboard } = useSmartEgg();
  const occupiedSlots = normalizeOccupiedSlots(
    dashboard?.latest?.occupied_slots,
  );
  return useMemo(
    () => buildEggViews(hoveredEgg, selection, occupiedSlots),
    [hoveredEgg, occupiedSlots, selection],
  );
}

/** Cantidad física reportada por `SLOTS` en la telemetría del Arduino. */
export function useOccupiedSlots(): number {
  const { dashboard } = useSmartEgg();
  return normalizeOccupiedSlots(dashboard?.latest?.occupied_slots);
}
