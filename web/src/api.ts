import type { ThermostatCommands, ThermostatMode, ThermostatState } from "./thermostat.js";

const SESSION_KEY = "nest-session";
const STATE_KEY = "nest-last-state";

export class ApiError extends Error { constructor(public readonly code: string, message: string) { super(message); } }

export class ThermostatApi implements ThermostatCommands {
  constructor(private readonly baseUrl: string, private readonly storage: Storage = localStorage) {}
  isUnlocked(): boolean { return Boolean(this.storage.getItem(SESSION_KEY)); }
  signOut(): void { this.storage.removeItem(SESSION_KEY); }

  async unlock(accessCode: string): Promise<void> {
    const payload = await this.request<{ token: string }>("/v1/session", { method: "POST", body: JSON.stringify({ accessCode }) }, false);
    this.storage.setItem(SESSION_KEY, payload.token);
  }

  async getState(): Promise<ThermostatState> {
    const state = await this.request<ThermostatState>("/v1/thermostat");
    this.storage.setItem(STATE_KEY, JSON.stringify(state));
    return state;
  }

  cachedState(): ThermostatState | null {
    try { const value = this.storage.getItem(STATE_KEY); return value ? JSON.parse(value) as ThermostatState : null; } catch { return null; }
  }

  async setMode(mode: ThermostatMode): Promise<ThermostatState> {
    const result = await this.request<{ state: ThermostatState }>("/v1/thermostat/mode", { method: "POST", body: JSON.stringify({ mode }) });
    return result.state;
  }

  async setSetpoint(request: { mode: "HEAT" | "COOL"; target: number } | { mode: "HEATCOOL"; heat: number; cool: number }): Promise<ThermostatState> {
    const result = await this.request<{ state: ThermostatState }>("/v1/thermostat/setpoint", { method: "POST", body: JSON.stringify(request) });
    return result.state;
  }

  private async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    if (!this.baseUrl) throw new ApiError("SETUP_REQUIRED", "The private Google Cloud bridge has not been configured yet.");
    const headers = new Headers(init.headers); headers.set("content-type", "application/json");
    if (authenticated) { const token = this.storage.getItem(SESSION_KEY); if (token) headers.set("authorization", `Bearer ${token}`); }
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, cache: "no-store" });
    const payload = await response.json() as T & { error?: { code: string; message: string } };
    if (!response.ok) throw new ApiError(payload.error?.code ?? "REQUEST_FAILED", payload.error?.message ?? "The thermostat service is unavailable.");
    return payload;
  }
}
