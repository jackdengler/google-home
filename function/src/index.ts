import { http } from "@google-cloud/functions-framework";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { GoogleSdmClient } from "./google.js";

const config = readConfig();
const client = new GoogleSdmClient({
  projectId: config.DEVICE_ACCESS_PROJECT_ID,
  clientId: config.OAUTH_CLIENT_ID,
  clientSecret: config.OAUTH_CLIENT_SECRET,
  refreshToken: config.OAUTH_REFRESH_TOKEN,
  thermostatResourceName: config.THERMOSTAT_RESOURCE_NAME,
});

export const app = createApp({
  allowedOrigin: config.ALLOWED_ORIGIN,
  accessCodeHash: config.ACCESS_CODE_HASH,
  sessionSecret: config.SESSION_SIGNING_SECRET,
  scale: config.DISPLAY_SCALE,
  bounds: { min: config.MIN_SETPOINT, max: config.MAX_SETPOINT },
  client,
});

http("api", app);
