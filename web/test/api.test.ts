import { describe, expect, it } from "vitest";
import { ApiError, ThermostatApi } from "../src/api.js";

describe("ThermostatApi configuration", () => {
  it("explains when the private Google Cloud bridge is not configured", async () => {
    const api = new ThermostatApi("");
    await expect(api.unlock("nest-4829")).rejects.toEqual(new ApiError("SETUP_REQUIRED", "The private Google Cloud bridge has not been configured yet."));
  });
});
