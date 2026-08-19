import { describe, expect, it } from "vitest";
import {
  DomainError,
  createModeCommand,
  createFanTimerCommand,
  createSetpointCommand,
  fromCelsius,
  normalizeDevice,
  toCelsius,
} from "../src/domain.js";

describe("temperature conversion", () => {
  it("converts Fahrenheit input to the Celsius required by SDM", () => {
    expect(toCelsius(72, "F")).toBeCloseTo(22.222, 3);
    expect(fromCelsius(22.222, "F")).toBeCloseTo(72, 2);
  });
});

describe("commands", () => {
  it("creates the exact SDM heat setpoint command", () => {
    expect(createSetpointCommand("HEAT", { target: 72 }, { min: 50, max: 90, scale: "F" })).toEqual({
      command: "sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat",
      params: { heatCelsius: 22.22222222222222 },
    });
  });

  it("rejects setpoints while the thermostat is off", () => {
    expect(() => createSetpointCommand("OFF", { target: 72 }, { min: 50, max: 90, scale: "F" }))
      .toThrowError(new DomainError("INCOMPATIBLE_MODE", "Choose Heat, Cool, or Heat · Cool first."));
  });

  it("rejects targets outside the configured safe range", () => {
    expect(() => createSetpointCommand("COOL", { target: 95 }, { min: 50, max: 90, scale: "F" }))
      .toThrowError(/between 50° and 90°/);
  });

  it("allowlists standard thermostat modes", () => {
    expect(createModeCommand("COOL")).toEqual({
      command: "sdm.devices.commands.ThermostatMode.SetMode",
      params: { mode: "COOL" },
    });
  });

  it("creates 15-minute fan timer commands and supports stopping", () => {
    expect(createFanTimerCommand(45)).toEqual({ command: "sdm.devices.commands.Fan.SetTimer", params: { timerMode: "ON", duration: "2700s" } });
    expect(createFanTimerCommand(0)).toEqual({ command: "sdm.devices.commands.Fan.SetTimer", params: { timerMode: "OFF" } });
    expect(() => createFanTimerCommand(20)).toThrowError(/15-minute/);
  });
});

describe("device normalization", () => {
  it("normalizes known traits and leaves unavailable traits null", () => {
    const state = normalizeDevice({
      name: "enterprises/p/devices/t",
      type: "sdm.devices.types.THERMOSTAT",
      traits: {
        "sdm.devices.traits.Info": { customName: "Living Room" },
        "sdm.devices.traits.Connectivity": { status: "ONLINE" },
        "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 20 },
        "sdm.devices.traits.ThermostatMode": { mode: "HEAT", availableModes: ["OFF", "HEAT"] },
        "sdm.devices.traits.ThermostatTemperatureSetpoint": { heatCelsius: 22.2222222222 },
        "sdm.devices.traits.ThermostatHvac": { status: "HEATING" },
        "sdm.devices.traits.Fan": { timerMode: "ON", timerTimeout: "2026-08-18T12:45:00Z" },
      },
    }, "F", new Date("2026-08-18T12:00:00Z"));

    expect(state).toMatchObject({
      observedAt: "2026-08-18T12:00:00.000Z",
      name: "Living Room",
      online: true,
      ambientTemperature: 68,
      heatSetpoint: 72,
      coolSetpoint: null,
      humidity: null,
      mode: "HEAT",
      hvacStatus: "HEATING",
      availableModes: ["OFF", "HEAT"],
      fanAvailable: true,
      fanTimerMode: "ON",
      fanTimerTimeout: "2026-08-18T12:45:00Z",
      scale: "F",
    });
  });
});
