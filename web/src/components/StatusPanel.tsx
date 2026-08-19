import type { ControllerSnapshot } from "../thermostat.js";
export function StatusPanel({ value }: { value: ControllerSnapshot }) {
  const { confirmed, pending, error, draftTarget } = value;
  const active = pending ? "Setting…" : confirmed.hvacStatus === "HEATING" ? `Heating to ${draftTarget}°` : confirmed.hvacStatus === "COOLING" ? `Cooling to ${draftTarget}°` : confirmed.mode === "OFF" ? "System off" : "Ready";
  return <>
    <p class="system-status" aria-live="polite">{active}</p>
    <div class="telemetry"><span><b>{confirmed.humidity === null ? "—" : `${confirmed.humidity}%`}</b> humidity</span><span><i class={confirmed.online ? "online-dot" : "offline-dot"} />{confirmed.online ? "Online" : "Offline"}</span></div>
    {error && <p class="error-banner" role="alert">{error} Try again when the thermostat is online.</p>}
  </>;
}
