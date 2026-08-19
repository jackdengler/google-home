import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { hashAccessCode } from "../src/session.js";
import type { SdmDevice } from "../src/domain.js";

const device: SdmDevice = {
  name: "enterprises/p/devices/t",
  type: "sdm.devices.types.THERMOSTAT",
  traits: {
    "sdm.devices.traits.Info": { customName: "Living Room" },
    "sdm.devices.traits.Connectivity": { status: "ONLINE" },
    "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 20 },
    "sdm.devices.traits.ThermostatMode": { mode: "HEAT", availableModes: ["OFF", "HEAT", "COOL"] },
    "sdm.devices.traits.ThermostatTemperatureSetpoint": { heatCelsius: 22.2222222222 },
    "sdm.devices.traits.ThermostatHvac": { status: "HEATING" },
    "sdm.devices.traits.Fan": { timerMode: "OFF" },
  },
};

describe("thermostat HTTP API", () => {
  let execute: ReturnType<typeof vi.fn>;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    execute = vi.fn().mockResolvedValue(undefined);
    app = createApp({
      allowedOrigin: "https://jackdengler.github.io",
      accessCodeHash: await hashAccessCode("nest-4829"),
      sessionSecret: "s".repeat(32),
      scale: "F",
      bounds: { min: 50, max: 90 },
      client: { getThermostat: vi.fn().mockResolvedValue(device), execute },
    });
  });

  async function unlock(): Promise<string> {
    const response = await request(app).post("/v1/session").set("Origin", "https://jackdengler.github.io").send({ accessCode: "nest-4829" });
    return response.body.token as string;
  }

  it("allows only the configured GitHub Pages origin", async () => {
    const allowed = await request(app).options("/v1/thermostat").set("Origin", "https://jackdengler.github.io");
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://jackdengler.github.io");
    const denied = await request(app).options("/v1/thermostat").set("Origin", "https://evil.example");
    expect(denied.status).toBe(403);
  });

  it("unlocks and returns normalized no-store thermostat state", async () => {
    const token = await unlock();
    const response = await request(app).get("/v1/thermostat").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({ name: "Living Room", ambientTemperature: 68, heatSetpoint: 72, mode: "HEAT" });
  });

  it("rejects thermostat reads without a session", async () => {
    const response = await request(app).get("/v1/thermostat");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_SESSION");
  });

  it("executes only validated mode and setpoint commands", async () => {
    const token = await unlock();
    await request(app).post("/v1/thermostat/mode").set("Authorization", `Bearer ${token}`).send({ mode: "COOL" }).expect(200);
    await request(app).post("/v1/thermostat/setpoint").set("Authorization", `Bearer ${token}`).send({ mode: "HEAT", target: 72 }).expect(200);
    expect(execute.mock.calls.map(([command]) => command.command)).toEqual([
      "sdm.devices.commands.ThermostatMode.SetMode",
      "sdm.devices.commands.ThermostatTemperatureSetpoint.SetHeat",
    ]);
  });

  it("rejects unsafe temperatures without calling Google", async () => {
    const token = await unlock();
    const response = await request(app).post("/v1/thermostat/setpoint").set("Authorization", `Bearer ${token}`).send({ mode: "COOL", target: 95 });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("UNSAFE_TEMPERATURE");
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs and stops the fan using validated 15-minute intervals", async () => {
    const token = await unlock();
    await request(app).post("/v1/thermostat/fan").set("Authorization", `Bearer ${token}`).send({ minutes: 45 }).expect(200);
    await request(app).post("/v1/thermostat/fan").set("Authorization", `Bearer ${token}`).send({ minutes: 0 }).expect(200);
    const invalid = await request(app).post("/v1/thermostat/fan").set("Authorization", `Bearer ${token}`).send({ minutes: 20 });
    expect(invalid.status).toBe(422);
    expect(execute.mock.calls.map(([command]) => command)).toEqual([
      { command: "sdm.devices.commands.Fan.SetTimer", params: { timerMode: "ON", duration: "2700s" } },
      { command: "sdm.devices.commands.Fan.SetTimer", params: { timerMode: "OFF" } },
    ]);
  });
});
