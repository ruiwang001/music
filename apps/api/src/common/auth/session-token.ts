import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_PREFIX = "gsg1";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionTokenPayload {
  sub: string;
  email?: string | null;
  iat: number;
  exp: number;
}

export function issueSessionToken(input: { userId: string; email?: string | null }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionTokenPayload = {
    sub: input.userId,
    email: input.email ?? null,
    iat: now,
    exp: now + sessionTtlSeconds()
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${TOKEN_PREFIX}.${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  const [prefix, encodedPayload, signature] = token.split(".");
  if (prefix !== TOKEN_PREFIX || !encodedPayload || !signature) {
    return null;
  }

  if (!safeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  const payload = parsePayload(encodedPayload);
  if (!payload || !isUuid(payload.sub)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return null;
  }

  return payload;
}

function parsePayload(encodedPayload: string): SessionTokenPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionTokenPayload>;
    if (
      typeof parsed.sub !== "string" ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= parsed.iat
    ) {
      return null;
    }
    return {
      sub: parsed.sub,
      email: typeof parsed.email === "string" ? parsed.email : null,
      iat: parsed.iat,
      exp: parsed.exp
    };
  } catch {
    return null;
  }
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET?.trim() || process.env.MINIMAX_API_KEY?.trim();
  if (!secret || secret === "change-me") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SESSION_SECRET is required in production");
    }
    return "green-sonic-local-development-session-secret";
  }
  return secret;
}

function sessionTtlSeconds(): number {
  const configured = Number(process.env.AUTH_SESSION_TTL_SECONDS);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_TTL_SECONDS;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
