import type {
  AuthToken,
  DashboardState,
  Incubator,
  IncubatorConfig,
  IncubatorConfigUpdate,
  Technician,
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

  incubators: (token: string) =>
    request<Incubator[]>("/incubators", {}, token),

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

  dailyReport: (incubatorId: number, token: string, day?: string) => {
    const query = day ? `?day=${encodeURIComponent(day)}` : "";
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
