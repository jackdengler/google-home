import { describe, expect, it, vi } from "vitest";
import { GoogleSdmClient, UpstreamError } from "../src/google.js";

const config = {
  projectId: "project-1",
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  thermostatResourceName: "enterprises/project-1/devices/thermostat-1",
};

describe("GoogleSdmClient", () => {
  it("reuses a non-expired OAuth access token", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }), { status: 200 }))
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ name: config.thermostatResourceName, type: "sdm.devices.types.THERMOSTAT", traits: {} }), { status: 200 })));
    const client = new GoogleSdmClient(config, fetcher);
    await client.getThermostat();
    await client.getThermostat();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("oauth2.googleapis.com"))).toHaveLength(1);
  });

  it("refreshes once after an SDM authorization failure", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "old", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: config.thermostatResourceName, type: "sdm.devices.types.THERMOSTAT", traits: {} }), { status: 200 }));
    const client = new GoogleSdmClient(config, fetcher);
    await expect(client.getThermostat()).resolves.toMatchObject({ type: "sdm.devices.types.THERMOSTAT" });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("maps rate limiting without exposing the upstream response body", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response("secret upstream detail", { status: 429 }));
    const client = new GoogleSdmClient(config, fetcher);
    await expect(client.getThermostat()).rejects.toEqual(new UpstreamError("RATE_LIMITED", 429, "Google Nest is receiving changes too quickly."));
  });
});
