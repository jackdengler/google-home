import { describe, expect, it, vi } from "vitest";
import { createThermostatController, type ThermostatState } from "../src/thermostat.js";

const state: ThermostatState = {
  observedAt: "2026-08-18T12:00:00Z", name: "Living Room", room: null, online: true,
  ambientTemperature: 68, heatSetpoint: 72, coolSetpoint: null, humidity: 43,
  mode: "HEAT", hvacStatus: "HEATING", ecoMode: null, availableModes: ["OFF", "HEAT", "COOL"], scale: "F",
  fanAvailable: true, fanTimerMode: "OFF", fanTimerTimeout: null,
};

describe("thermostat controller", () => {
  it("shows rapid draft changes immediately but sends one final setpoint", async () => {
    vi.useFakeTimers();
    const setSetpoint = vi.fn().mockResolvedValue({ ...state, heatSetpoint: 75 });
    const controller = createThermostatController({ setSetpoint, setMode: vi.fn(), setFan: vi.fn() }, state, 650);
    controller.adjust(1); controller.adjust(1); controller.adjust(1);
    expect(controller.snapshot().draftTarget).toBe(75);
    expect(setSetpoint).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(650);
    expect(setSetpoint).toHaveBeenCalledOnce();
    expect(setSetpoint).toHaveBeenCalledWith({ mode: "HEAT", target: 75 });
    expect(controller.snapshot().confirmed.heatSetpoint).toBe(75);
    vi.useRealTimers();
  });

  it("restores the confirmed setpoint after a failed command", async () => {
    vi.useFakeTimers();
    const controller = createThermostatController({ setSetpoint: vi.fn().mockRejectedValue(new Error("offline")), setMode: vi.fn(), setFan: vi.fn() }, state, 10);
    controller.adjust(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(controller.snapshot()).toMatchObject({ draftTarget: 72, pending: false, error: "offline" });
    vi.useRealTimers();
  });

  it("accepts more adjustments while a setpoint request is in flight and sends only the latest target next", async () => {
    vi.useFakeTimers();
    let finishFirst!: (value: ThermostatState) => void;
    const first = new Promise<ThermostatState>((resolve) => { finishFirst = resolve; });
    const setSetpoint = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ...state, heatSetpoint: 76 });
    const controller = createThermostatController({ setSetpoint, setMode: vi.fn(), setFan: vi.fn() }, state, 10);

    controller.adjust(1);
    await vi.advanceTimersByTimeAsync(10);
    controller.adjust(1); controller.adjust(1); controller.adjust(1);
    expect(controller.snapshot().draftTarget).toBe(76);
    await vi.advanceTimersByTimeAsync(10);
    expect(setSetpoint).toHaveBeenCalledOnce();

    finishFirst({ ...state, heatSetpoint: 73 });
    await vi.runAllTimersAsync();
    expect(setSetpoint).toHaveBeenCalledTimes(2);
    expect(setSetpoint).toHaveBeenLastCalledWith({ mode: "HEAT", target: 76 });
    vi.useRealTimers();
  });
});
