export type TemperatureScale = "F" | "C";
export type ThermostatMode = "OFF" | "HEAT" | "COOL" | "HEATCOOL";
export type HvacStatus = "OFF" | "HEATING" | "COOLING" | "UNKNOWN";

export interface SdmDevice {
  name: string;
  type: string;
  traits: Record<string, Record<string, unknown>>;
  parentRelations?: Array<{ displayName?: string }>;
}

export interface ThermostatState {
  observedAt: string;
  name: string;
  room: string | null;
  online: boolean;
  ambientTemperature: number | null;
  heatSetpoint: number | null;
  coolSetpoint: number | null;
  humidity: number | null;
  mode: ThermostatMode;
  hvacStatus: HvacStatus;
  ecoMode: string | null;
  availableModes: ThermostatMode[];
  scale: TemperatureScale;
}

export interface SdmCommand {
  command: string;
  params: Record<string, string | number>;
}

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export function toCelsius(value: number, scale: TemperatureScale): number {
  return scale === "C" ? value : (value - 32) * 5 / 9;
}

export function fromCelsius(value: number, scale: TemperatureScale): number {
  const converted = scale === "C" ? value : value * 9 / 5 + 32;
  return Math.round(converted * 10) / 10;
}

export function createModeCommand(mode: ThermostatMode): SdmCommand {
  return {
    command: "sdm.devices.commands.ThermostatMode.SetMode",
    params: { mode },
  };
}

type SetpointRequest = { target: number } | { heat: number; cool: number };

export function createSetpointCommand(
  mode: ThermostatMode,
  request: SetpointRequest,
  bounds: { min: number; max: number; scale: TemperatureScale },
): SdmCommand {
  const values = "target" in request ? [request.target] : [request.heat, request.cool];
  if (values.some((value) => !Number.isFinite(value) || value < bounds.min || value > bounds.max)) {
    throw new DomainError("UNSAFE_TEMPERATURE", `Temperature must be between ${bounds.min}° and ${bounds.max}°.`);
  }
  if (mode === "OFF") {
    throw new DomainError("INCOMPATIBLE_MODE", "Choose Heat, Cool, or Heat · Cool first.");
  }
  if (mode === "HEAT" && "target" in request) {
    return { command: "sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat", params: { heatCelsius: toCelsius(request.target, bounds.scale) } };
  }
  if (mode === "COOL" && "target" in request) {
    return { command: "sdm.devices.commands.ThermostatTemperatureSetpoint.SetCool", params: { coolCelsius: toCelsius(request.target, bounds.scale) } };
  }
  if (mode === "HEATCOOL" && "heat" in request) {
    if (request.heat >= request.cool) {
      throw new DomainError("INVALID_RANGE", "The cooling setpoint must be higher than the heating setpoint.");
    }
    return {
      command: "sdm.devices.commands.ThermostatTemperatureSetpoint.SetRange",
      params: { heatCelsius: toCelsius(request.heat, bounds.scale), coolCelsius: toCelsius(request.cool, bounds.scale) },
    };
  }
  throw new DomainError("INCOMPATIBLE_MODE", "The setpoint does not match the selected mode.");
}

function numberTrait(traits: SdmDevice["traits"], name: string, field: string): number | null {
  const value = traits[name]?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringTrait(traits: SdmDevice["traits"], name: string, field: string): string | null {
  const value = traits[name]?.[field];
  return typeof value === "string" ? value : null;
}

export function normalizeDevice(device: SdmDevice, scale: TemperatureScale, now = new Date()): ThermostatState {
  const traits = device.traits;
  const modeValue = stringTrait(traits, "sdm.devices.traits.ThermostatMode", "mode");
  const modesValue = traits["sdm.devices.traits.ThermostatMode"]?.availableModes;
  const availableModes = Array.isArray(modesValue)
    ? modesValue.filter((mode): mode is ThermostatMode => ["OFF", "HEAT", "COOL", "HEATCOOL"].includes(String(mode)))
    : [];
  const ambient = numberTrait(traits, "sdm.devices.traits.Temperature", "ambientTemperatureCelsius");
  const heat = numberTrait(traits, "sdm.devices.traits.ThermostatTemperatureSetpoint", "heatCelsius");
  const cool = numberTrait(traits, "sdm.devices.traits.ThermostatTemperatureSetpoint", "coolCelsius");
  const humidity = numberTrait(traits, "sdm.devices.traits.Humidity", "ambientHumidityPercent");
  const hvac = stringTrait(traits, "sdm.devices.traits.ThermostatHvac", "status");
  return {
    observedAt: now.toISOString(),
    name: stringTrait(traits, "sdm.devices.traits.Info", "customName") ?? "Nest Thermostat",
    room: device.parentRelations?.[0]?.displayName ?? null,
    online: stringTrait(traits, "sdm.devices.traits.Connectivity", "status") === "ONLINE",
    ambientTemperature: ambient === null ? null : fromCelsius(ambient, scale),
    heatSetpoint: heat === null ? null : fromCelsius(heat, scale),
    coolSetpoint: cool === null ? null : fromCelsius(cool, scale),
    humidity,
    mode: ["OFF", "HEAT", "COOL", "HEATCOOL"].includes(modeValue ?? "") ? modeValue as ThermostatMode : "OFF",
    hvacStatus: ["OFF", "HEATING", "COOLING"].includes(hvac ?? "") ? hvac as HvacStatus : "UNKNOWN",
    ecoMode: stringTrait(traits, "sdm.devices.traits.ThermostatEco", "mode"),
    availableModes,
    scale,
  };
}
