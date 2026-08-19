import type { ThermostatMode } from "../thermostat.js";

const labels: Record<ThermostatMode, string> = { OFF: "Off", HEAT: "Heat", COOL: "Cool", HEATCOOL: "Heat · Cool" };
export function ModeSelector({ mode, available, disabled, onSelect }: { mode: ThermostatMode; available: ThermostatMode[]; disabled: boolean; onSelect(mode: ThermostatMode): void }) {
  return <fieldset class="mode-selector" disabled={disabled}><legend>System mode</legend>{available.map((value) =>
    <button key={value} type="button" class={value === mode ? "is-active" : ""} aria-pressed={value === mode} onClick={() => onSelect(value)}>{labels[value]}</button>
  )}</fieldset>;
}
