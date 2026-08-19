import { describe, expect, it } from "vitest";
import { hashAccessCode, issueSession, verifyAccessCode, verifySession } from "../src/session.js";
import { UnlockLimiter } from "../src/rate-limit.js";

describe("access codes", () => {
  it("rejects access codes that are too weak", async () => {
    await expect(hashAccessCode("1234")).rejects.toThrow(/at least 8/);
  });

  it("stores a salted scrypt hash and verifies the original code", async () => {
    const hash = await hashAccessCode("nest-4829");
    expect(hash).not.toContain("nest-4829");
    await expect(verifyAccessCode("nest-4829", hash)).resolves.toBe(true);
    await expect(verifyAccessCode("wrong-code", hash)).resolves.toBe(false);
  });
});

describe("sessions", () => {
  it("issues a scoped token that expires after 30 days", async () => {
    const secret = "a".repeat(32);
    const issued = new Date("2026-08-18T00:00:00Z");
    const token = await issueSession(secret, issued);
    await expect(verifySession(token, secret, new Date("2026-09-16T23:59:59Z"))).resolves.toMatchObject({ scope: "thermostat:control" });
    await expect(verifySession(token, secret, new Date("2026-09-18T00:00:01Z"))).rejects.toThrow(/expired/i);
  });
});

describe("unlock throttling", () => {
  it("blocks the sixth failed attempt inside fifteen minutes", () => {
    const limiter = new UnlockLimiter({ maxAttempts: 5, windowMs: 900_000 });
    const now = 1_787_000_000_000;
    for (let index = 0; index < 5; index += 1) limiter.recordFailure("client", now + index);
    expect(() => limiter.consume("client", now + 10)).toThrow(/Try again later/);
  });
});
