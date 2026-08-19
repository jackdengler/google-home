import { expect, test } from "@playwright/test";

const initial = {
  observedAt: "2026-08-18T12:00:00Z", name: "Living Room", room: "Downstairs", online: true,
  ambientTemperature: 68, heatSetpoint: 72, coolSetpoint: null, humidity: 43,
  mode: "HEAT", hvacStatus: "HEATING", ecoMode: null, availableModes: ["OFF", "HEAT", "COOL"], scale: "F",
};

test("unlocks and coalesces rapid temperature changes on an iPhone viewport", async ({ page }) => {
  let setpointRequests = 0;
  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session")) return route.fulfill({ json: { token: "session", expiresIn: 2_592_000 } });
    if (path.endsWith("/setpoint")) {
      setpointRequests += 1;
      return route.fulfill({ json: { accepted: true, state: { ...initial, heatSetpoint: 75, observedAt: new Date().toISOString() } } });
    }
    return route.fulfill({ json: initial });
  });

  await page.goto("./");
  await page.getByLabel("Shared access code").fill("nest-4829");
  await page.getByRole("button", { name: "Unlock thermostat" }).click();
  await expect(page.getByRole("heading", { name: "Living Room" })).toBeVisible();
  await page.getByRole("button", { name: "Raise target temperature" }).click({ clickCount: 3, delay: 70 });
  await expect(page.getByLabel("Target temperature", { exact: true })).toContainText("75°");
  await page.waitForTimeout(800);
  expect(setpointRequests).toBe(1);
  expect(await page.viewportSize()).toEqual({ width: 390, height: 664 });
});

test("disables controls when the thermostat is offline", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("nest-session", "session"));
  await page.route("**/v1/thermostat", (route) => route.fulfill({ json: { ...initial, online: false } }));
  await page.goto("./");
  await expect(page.getByText("OFFLINE", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Raise target temperature" })).toBeDisabled();
});
