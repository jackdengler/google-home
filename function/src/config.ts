import { z } from "zod";

const schema = z.object({
  ALLOWED_ORIGIN: z.string().url(),
  DEVICE_ACCESS_PROJECT_ID: z.string().min(1),
  OAUTH_CLIENT_ID: z.string().min(1),
  OAUTH_CLIENT_SECRET: z.string().min(1),
  OAUTH_REFRESH_TOKEN: z.string().min(1),
  THERMOSTAT_RESOURCE_NAME: z.string().startsWith("enterprises/"),
  ACCESS_CODE_HASH: z.string().startsWith("scrypt:"),
  SESSION_SIGNING_SECRET: z.string().min(32),
  DISPLAY_SCALE: z.enum(["F", "C"]).default("F"),
  MIN_SETPOINT: z.coerce.number().default(50),
  MAX_SETPOINT: z.coerce.number().default(90),
});

export type AppConfig = z.infer<typeof schema>;
export function readConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig { return schema.parse(environment); }
