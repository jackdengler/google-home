import type { SdmCommand, SdmDevice } from "./domain.js";

interface GoogleConfig {
  projectId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  thermostatResourceName: string;
}

export class UpstreamError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

export class GoogleSdmClient {
  private accessToken: { value: string; expiresAt: number } | null = null;
  constructor(private readonly config: GoogleConfig, private readonly fetcher: typeof fetch = fetch) {}

  async getThermostat(): Promise<SdmDevice> {
    return this.request<SdmDevice>(this.config.thermostatResourceName, { method: "GET" });
  }

  async execute(command: SdmCommand): Promise<void> {
    await this.request(`${this.config.thermostatResourceName}:executeCommand`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    });
  }

  private async token(force = false): Promise<string> {
    if (!force && this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
      grant_type: "refresh_token",
    });
    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body,
    });
    if (!response.ok) throw new UpstreamError("NEST_AUTHORIZATION", 502, "Nest authorization needs to be reconnected.");
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new UpstreamError("NEST_AUTHORIZATION", 502, "Nest authorization needs to be reconnected.");
    this.accessToken = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
    return payload.access_token;
  }

  private async request<T = unknown>(path: string, init: RequestInit, retried = false): Promise<T> {
    const token = await this.token(retried);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    const response = await this.fetcher(`https://smartdevicemanagement.googleapis.com/v1/${path}`, { ...init, headers });
    if (response.status === 401 && !retried) {
      this.accessToken = null;
      return this.request<T>(path, init, true);
    }
    if (!response.ok) throw mapUpstreamError(response.status);
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

function mapUpstreamError(status: number): UpstreamError {
  if (status === 429) return new UpstreamError("RATE_LIMITED", 429, "Google Nest is receiving changes too quickly.");
  if (status === 401 || status === 403) return new UpstreamError("NEST_AUTHORIZATION", 502, "Nest authorization needs to be reconnected.");
  if (status === 404) return new UpstreamError("THERMOSTAT_NOT_FOUND", 502, "The configured thermostat is unavailable.");
  return new UpstreamError("NEST_UPSTREAM", 502, "Google Nest could not complete the request.");
}
