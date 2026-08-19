import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { createFanTimerCommand, createModeCommand, createSetpointCommand, DomainError, normalizeDevice, type SdmCommand, type SdmDevice, type TemperatureScale } from "./domain.js";
import { UpstreamError } from "./google.js";
import { UnlockLimiter } from "./rate-limit.js";
import { issueSession, verifyAccessCode, verifySession } from "./session.js";

interface ThermostatClient {
  getThermostat(): Promise<SdmDevice>;
  execute(command: SdmCommand): Promise<void>;
}

interface AppDependencies {
  allowedOrigin: string;
  accessCodeHash: string;
  sessionSecret: string;
  scale: TemperatureScale;
  bounds: { min: number; max: number };
  client: ThermostatClient;
  limiter?: UnlockLimiter;
}

const modeSchema = z.object({ mode: z.enum(["OFF", "HEAT", "COOL", "HEATCOOL"]) }).strict();
const setpointSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("HEAT"), target: z.number().finite() }).strict(),
  z.object({ mode: z.literal("COOL"), target: z.number().finite() }).strict(),
  z.object({ mode: z.literal("HEATCOOL"), heat: z.number().finite(), cool: z.number().finite() }).strict(),
]);

export function createApp(dependencies: AppDependencies): express.Express {
  const app = express();
  const limiter = dependencies.limiter ?? new UnlockLimiter();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb" }));
  app.use((req, res, next) => {
    res.locals.requestId = req.get("x-request-id")?.slice(0, 80) || randomUUID();
    res.set("x-request-id", res.locals.requestId);
    res.set("cache-control", "no-store");
    const origin = req.get("origin");
    if (origin) {
      if (origin !== dependencies.allowedOrigin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        return sendError(res, 403, "ORIGIN_DENIED", "This app origin is not allowed.");
      }
      res.set("access-control-allow-origin", origin);
      res.set("vary", "Origin");
      res.set("access-control-allow-headers", "authorization, content-type, x-request-id");
      res.set("access-control-allow-methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.post("/v1/session", async (req, res) => {
    const key = req.ip || "unknown";
    try {
      limiter.consume(key);
      const parsed = z.object({ accessCode: z.string().min(1).max(128) }).strict().safeParse(req.body);
      if (!parsed.success || !await verifyAccessCode(parsed.data.accessCode, dependencies.accessCodeHash)) {
        limiter.recordFailure(key);
        return sendError(res, 401, "UNLOCK_FAILED", "The access code was not accepted.");
      }
      limiter.reset(key);
      return res.json({ token: await issueSession(dependencies.sessionSecret), expiresIn: 30 * 24 * 60 * 60 });
    } catch {
      return sendError(res, 429, "UNLOCK_THROTTLED", "Too many attempts. Try again later.");
    }
  });

  const authorize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) { sendError(res, 401, "INVALID_SESSION", "Unlock the thermostat again."); return; }
    try { await verifySession(header.slice(7), dependencies.sessionSecret); next(); }
    catch { sendError(res, 401, "INVALID_SESSION", "Unlock the thermostat again."); }
  };

  const getState = async (): Promise<ReturnType<typeof normalizeDevice>> =>
    normalizeDevice(await dependencies.client.getThermostat(), dependencies.scale);

  app.get("/v1/thermostat", authorize, async (_req, res, next) => {
    try { res.json(await getState()); } catch (error) { next(error); }
  });

  app.post("/v1/thermostat/mode", authorize, async (req, res, next) => {
    try {
      const value = modeSchema.parse(req.body);
      await dependencies.client.execute(createModeCommand(value.mode));
      res.json({ accepted: true, state: await getState() });
    } catch (error) { next(error); }
  });

  app.post("/v1/thermostat/setpoint", authorize, async (req, res, next) => {
    try {
      const value = setpointSchema.parse(req.body);
      const command = value.mode === "HEATCOOL"
        ? createSetpointCommand(value.mode, { heat: value.heat, cool: value.cool }, { ...dependencies.bounds, scale: dependencies.scale })
        : createSetpointCommand(value.mode, { target: value.target }, { ...dependencies.bounds, scale: dependencies.scale });
      await dependencies.client.execute(command);
      res.json({ accepted: true, state: await getState() });
    } catch (error) { next(error); }
  });

  app.post("/v1/thermostat/fan", authorize, async (req, res, next) => {
    try {
      const value = z.object({ minutes: z.number().int().min(0).max(720) }).strict().parse(req.body);
      await dependencies.client.execute(createFanTimerCommand(value.minutes));
      res.json({ accepted: true, state: await getState() });
    } catch (error) { next(error); }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof DomainError) return sendError(res, 422, error.code, error.message);
    if (error instanceof UpstreamError) return sendError(res, error.status, error.code, error.message);
    if (error instanceof z.ZodError) return sendError(res, 400, "INVALID_REQUEST", "The request was not valid.");
    return sendError(res, 500, "INTERNAL_ERROR", "The thermostat service hit an unexpected error.");
  });
  return app;
}

function sendError(res: Response, status: number, code: string, message: string): Response {
  return res.status(status).json({ error: { code, message, requestId: res.locals.requestId } });
}
