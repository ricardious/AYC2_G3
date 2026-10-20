import type {
  Alarm,
  AdminStatus,
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
  RotationEvent,
  Technician,
  TechnicianCreate,
  TechnicianWithAssignments,
  TelemetryReading,
} from "./types";

const API_PREFIX = "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function browserApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://127.0.0.1:8000";
}

export function websocketUrl(incubatorId: number, token: string): string {
  const origin = browserApiOrigin().replace(/^http/, "ws");
  return `${origin}${API_PREFIX}/ws/incubators/${incubatorId}?token=${encodeURIComponent(token)}`;
}

export function rfidAccessWebsocketUrl(
  incubatorCode: string,
  kioskKey: string,
): string {
  const origin = browserApiOrigin().replace(/^http/, "ws");
  return `${origin}${API_PREFIX}/access/ws/${encodeURIComponent(incubatorCode)}?key=${encodeURIComponent(kioskKey)}`;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string | unknown[] };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item) =>
          typeof item === "object" && item && "msg" in item
            ? String(item.msg)
            : String(item),
        )
        .join(". ");
    }
  } catch {
    // Use the HTTP status text when the response is not JSON.
  }
  return response.statusText || "No se pudo completar la solicitud";
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${browserApiOrigin()}${API_PREFIX}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  return (await response.json()) as T;
}

async function download(
  path: string,
  token: string,
  fallbackFilename: string,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${browserApiOrigin()}${API_PREFIX}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename =
    disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallbackFilename;
  return { blob: await response.blob(), filename };
}

export const api = {
  login: (username: string, password: string) =>
    request<AuthToken>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  me: (token: string) => request<Technician>("/auth/me", {}, token),

  adminStatus: (token: string) =>
    request<AdminStatus>("/auth/admin-status", {}, token),

  technicians: (token: string) =>
    request<TechnicianWithAssignments[]>("/auth/technicians", {}, token),

  createTechnician: (payload: TechnicianCreate, token: string) =>
    request<Technician>(
      "/auth/technicians",
      { method: "POST", body: JSON.stringify(payload) },
      token,
    ),

  updateTechnician: (
    technicianId: number,
    payload: { is_active?: boolean; rfid_uid?: string | null },
    token: string,
  ) =>
    request<TechnicianWithAssignments>(
      `/auth/technicians/${technicianId}`,
      { method: "PATCH", body: JSON.stringify(payload) },
      token,
    ),

  assignTechnician: (
    technicianId: number,
    incubatorIds: number[],
    token: string,
  ) =>
    request<TechnicianWithAssignments>(
      `/auth/technicians/${technicianId}/incubators`,
      { method: "PUT", body: JSON.stringify({ incubator_ids: incubatorIds }) },
      token,
    ),

  diagnostics: (token: string) =>
    request<DiagnosticSummary>("/me/diagnostics", {}, token),

  adminDiagnostics: (token: string, operatorId?: number) =>
    request<DiagnosticSummary>(
      `/admin/diagnostics${operatorId ? `?operator_id=${operatorId}` : ""}`,
      {},
      token,
    ),

  reportExports: (token: string) =>
    request<ReportExport[]>("/reports", {}, token),

  incubators: (token: string) =>
    request<Incubator[]>("/incubators", {}, token),

  lots: (token: string, status = "active") =>
    request<Lot[]>(`/lots?status=${encodeURIComponent(status)}`, {}, token),

  createLot: (payload: LotCreate, token: string) =>
    request<Lot>(
      "/lots",
      { method: "POST", body: JSON.stringify(payload) },
      token,
    ),

  eggs: (incubatorId: number, token: string, status = "incubating") =>
    request<Egg[]>(
      `/eggs?incubator_id=${incubatorId}&status=${encodeURIComponent(status)}`,
      {},
      token,
    ),

  registerEgg: (payload: EggCreate, token: string) =>
    request<Egg>(
      "/eggs",
      { method: "POST", body: JSON.stringify(payload) },
      token,
    ),

  createDoorEvent: (
    incubatorId: number,
    payload: DoorEventCreate,
    token: string,
  ) =>
    request<DoorEvent>(
      `/incubators/${incubatorId}/door-events`,
      { method: "POST", body: JSON.stringify(payload) },
      token,
    ),

  state: (incubatorId: number, token: string) =>
    request<DashboardState>(`/incubators/${incubatorId}/state`, {}, token),

  config: (incubatorId: number, token: string) =>
    request<IncubatorConfig>(`/incubators/${incubatorId}/config`, {}, token),

  updateConfig: (
    incubatorId: number,
    payload: IncubatorConfigUpdate,
    token: string,
  ) =>
    request<IncubatorConfig>(
      `/incubators/${incubatorId}/config`,
      { method: "PUT", body: JSON.stringify(payload) },
      token,
    ),

  telemetry: (incubatorId: number, token: string, limit = 240) =>
    request<TelemetryReading[]>(
      `/incubators/${incubatorId}/telemetry?limit=${limit}`,
      {},
      token,
    ),

  alarms: (incubatorId: number, token: string, limit = 500) =>
    request<Alarm[]>(
      `/incubators/${incubatorId}/alarms?limit=${limit}`,
      {},
      token,
    ),

  rotations: (incubatorId: number, token: string, limit = 500) =>
    request<RotationEvent[]>(
      `/incubators/${incubatorId}/rotations?limit=${limit}`,
      {},
      token,
    ),

  dailyReport: (
    incubatorId: number,
    token: string,
    day?: string,
    operatorId?: number,
  ) => {
    const parameters = new URLSearchParams();
    if (day) parameters.set("day", day);
    if (operatorId) parameters.set("operator_id", String(operatorId));
    const query = parameters.size ? `?${parameters.toString()}` : "";
    return download(
      `/reports/incubators/${incubatorId}/daily.pdf${query}`,
      token,
      `smartegg-${day ?? "hoy"}.pdf`,
    );
  },
};

export function apiOrigin(): string {
  return browserApiOrigin();
}
