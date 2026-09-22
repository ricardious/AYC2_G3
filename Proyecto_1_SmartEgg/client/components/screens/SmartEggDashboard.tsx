"use client";

import { useMemo } from "react";

import { ConsoleStage } from "@/components/templates/ConsoleStage";
import { EggRegistrationDialog } from "@/components/organisms/EggRegistrationDialog";
import { DoorOperationDialog } from "@/components/organisms/DoorOperationDialog";
import { DEFAULT_CONFIG } from "@/lib/smartegg/config";
import type { SmartEggConfig } from "@/lib/smartegg/types";
import { SmartEggProvider } from "@/lib/state/SmartEggProvider";
import { useSmartEgg } from "@/lib/state/hooks";

import { ControlCoreScreen } from "./ControlCoreScreen";
import { HistoryScreen } from "./HistoryScreen";
import { IncubationScreen } from "./IncubationScreen";
import { ReportsScreen } from "./ReportsScreen";
import { SettingsScreen } from "./SettingsScreen";
import { ConnectionGate } from "./ConnectionGate";
import { ObservatoryScreen } from "./ObservatoryScreen";
import { RolesScreen } from "./RolesScreen";
import { canNavigate, canOpenDoor } from "@/lib/auth/permissions";

export type SmartEggDashboardProps = Partial<SmartEggConfig>;

function ActiveScreen() {
  const { screen, technician } = useSmartEgg();

  if (technician && !canNavigate(technician.role, screen)) {
    return <ControlCoreScreen />;
  }

  switch (screen) {
    case "observatorio":
      return <ObservatoryScreen />;
    case "incubacion":
      return <IncubationScreen />;
    case "historial":
      return <HistoryScreen />;
    case "reportes":
      return <ReportsScreen />;
    case "config":
      return <SettingsScreen />;
    case "roles":
      return <RolesScreen />;
    case "control":
    default:
      return <ControlCoreScreen />;
  }
}

function DashboardContent() {
  const { registrationSlot, doorOperationOpen, technician } = useSmartEgg();

  return (
    <ConnectionGate>
      <ConsoleStage>
        <ActiveScreen />
      </ConsoleStage>
      {registrationSlot !== null ? (
        <EggRegistrationDialog key={registrationSlot} slot={registrationSlot} />
      ) : null}
      {doorOperationOpen && technician && canOpenDoor(technician.role) ? (
        <DoorOperationDialog />
      ) : null}
    </ConnectionGate>
  );
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
      <DashboardContent />
    </SmartEggProvider>
  );
}
