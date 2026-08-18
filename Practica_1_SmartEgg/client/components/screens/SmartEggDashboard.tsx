"use client";

import { useMemo } from "react";

import { ConsoleStage } from "@/components/templates/ConsoleStage";
import { DEFAULT_CONFIG } from "@/lib/smartegg/config";
import type { SmartEggConfig } from "@/lib/smartegg/types";
import { SmartEggProvider } from "@/lib/state/SmartEggProvider";
import { useSmartEgg } from "@/lib/state/hooks";

import { ControlCoreScreen } from "./ControlCoreScreen";
import { HistoryScreen } from "./HistoryScreen";
import { IncubationScreen } from "./IncubationScreen";
import { ReportsScreen } from "./ReportsScreen";
import { SettingsScreen } from "./SettingsScreen";

export type SmartEggDashboardProps = Partial<SmartEggConfig>;

function ActiveScreen() {
  const { screen } = useSmartEgg();

  switch (screen) {
    case "incubacion":
      return <IncubationScreen />;
    case "historial":
      return <HistoryScreen />;
    case "reportes":
      return <ReportsScreen />;
    case "config":
      return <SettingsScreen />;
    case "control":
    default:
      return <ControlCoreScreen />;
  }
}

/**
 * SmartEgg control console — the single entry point of the interface.
 *
 * All four tunables of the source design are exposed as props so the console
 * can be embedded in different contexts (demo, kiosk, alarm drill).
 */
export function SmartEggDashboard({
  criticalMode,
  airflowIntensity,
  showParticles,
  technician,
}: SmartEggDashboardProps) {
  const config = useMemo<SmartEggConfig>(
    () => ({
      criticalMode: criticalMode ?? DEFAULT_CONFIG.criticalMode,
      airflowIntensity: airflowIntensity ?? DEFAULT_CONFIG.airflowIntensity,
      showParticles: showParticles ?? DEFAULT_CONFIG.showParticles,
      technician: technician ?? DEFAULT_CONFIG.technician,
    }),
    [criticalMode, airflowIntensity, showParticles, technician],
  );

  return (
    <SmartEggProvider config={config}>
      <ConsoleStage>
        <ActiveScreen />
      </ConsoleStage>
    </SmartEggProvider>
  );
}
