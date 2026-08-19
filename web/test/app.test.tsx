import { render, screen } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/app.js";
import type { ThermostatState } from "../src/thermostat.js";

const state: ThermostatState = {
  observedAt: new Date().toISOString(), name: "Living Room", room: null, online: true,
  ambientTemperature: 68, heatSetpoint: 72, coolSetpoint: null, humidity: 43,
  mode: "HEAT", hvacStatus: "HEATING", ecoMode: null, availableModes: ["OFF", "HEAT", "COOL"], scale: "F",
  fanAvailable: true, fanTimerMode: "OFF", fanTimerTimeout: null,
};

describe("App", () => {
  it("unlocks before revealing thermostat controls", async () => {
    const api = { unlock: vi.fn().mockResolvedValue(undefined), signOut: vi.fn(), getState: vi.fn().mockResolvedValue(state), setSetpoint: vi.fn(), setMode: vi.fn(), setFan: vi.fn() };
    render(<App api={api} initiallyUnlocked={false} />);
    expect(screen.getByRole("heading", { name: "Your home, one turn away." })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Shared access code"), "nest-4829");
    await userEvent.click(screen.getByRole("button", { name: "Unlock thermostat" }));
    expect(await screen.findByRole("heading", { name: "Living Room" })).toBeInTheDocument();
    expect(screen.getByLabelText("Target temperature")).toHaveTextContent("72°");
  });

  it("labels live HVAC state and exposes large temperature controls", async () => {
    const api = { unlock: vi.fn(), signOut: vi.fn(), getState: vi.fn().mockResolvedValue(state), setSetpoint: vi.fn(), setMode: vi.fn(), setFan: vi.fn() };
    render(<App api={api} initiallyUnlocked />);
    expect(await screen.findByText("Heating to 72°")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lower target temperature" })).toHaveClass("temperature-step");
    expect(screen.getByRole("button", { name: "Raise target temperature" })).toHaveClass("temperature-step");
  });

  it("shows state-loading errors and lets an expired session unlock again", async () => {
    const api = { unlock: vi.fn(), signOut: vi.fn(), getState: vi.fn().mockRejectedValue(new Error("The configured thermostat is unavailable.")), setSetpoint: vi.fn(), setMode: vi.fn(), setFan: vi.fn() };
    render(<App api={api} initiallyUnlocked />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The configured thermostat is unavailable.");
    await userEvent.click(screen.getByRole("button", { name: "Unlock again" }));

    expect(api.signOut).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Your home, one turn away." })).toBeInTheDocument();
  });
});
