import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";

const scrypt = promisify(scryptCallback);
const SESSION_SECONDS = 30 * 24 * 60 * 60;

export async function hashAccessCode(code: string, salt = randomBytes(16)): Promise<string> {
  if (code.length < 8) throw new Error("Access code must be at least 8 characters.");
  const derived = await scrypt(code, salt, 64) as Buffer;
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}

export async function verifyAccessCode(code: string, encodedHash: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = encodedHash.split(":");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scrypt(code, Buffer.from(saltValue, "base64url"), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function secretKey(secret: string): Uint8Array {
  if (secret.length < 32) throw new Error("Session signing secret must be at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export async function issueSession(secret: string, now = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ scope: "thermostat:control", version: 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_SECONDS)
    .setSubject("personal-thermostat")
    .sign(secretKey(secret));
}

export async function verifySession(token: string, secret: string, now = new Date()): Promise<{ scope: string }> {
  try {
    const result = await jwtVerify(token, secretKey(secret), { currentDate: now, subject: "personal-thermostat" });
    if (result.payload.scope !== "thermostat:control" || result.payload.version !== 1) throw new Error("Invalid session scope.");
    return { scope: result.payload.scope };
  } catch (error) {
    if (error instanceof Error && error.message.includes('"exp" claim')) throw new Error("Session expired.");
    throw error;
  }
}
