import type { Technician } from "@/lib/api/types";
import type { ScreenId } from "@/lib/smartegg/types";

export type Role = Technician["role"];

const OPERATOR_SCREENS: readonly ScreenId[] = [
  "control",
  "observatorio",
  "incubacion",
  "historial",
  "reportes",
  "roles",
];

const ADMIN_SCREENS: readonly ScreenId[] = [
  "control",
  "observatorio",
  "incubacion",
  "historial",
  "reportes",
  "config",
  "roles",
];

export function screensForRole(role: Role): readonly ScreenId[] {
  return role === "admin" ? ADMIN_SCREENS : OPERATOR_SCREENS;
}

export function canNavigate(role: Role, screen: ScreenId): boolean {
  return screensForRole(role).includes(screen);
}

export function canOpenDoor(role: Role): boolean {
  return role === "operator_1" || role === "operator_2";
}

export function canManageSystem(role: Role): boolean {
  return role === "admin";
}
