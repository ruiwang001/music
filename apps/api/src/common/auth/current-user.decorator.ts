import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { verifySessionToken } from "./session-token";

export interface CurrentUser {
  id: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): CurrentUser => {
  const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
  return resolveCurrentUserFromHeaders(request.headers);
});

export function resolveCurrentUserFromHeaders(headers: Record<string, string | string[] | undefined>): CurrentUser {
  const token = bearerToken(headers.authorization);
  if (token) {
    const payload = verifySessionToken(token);
    if (!payload) {
      throw new UnauthorizedException("登录状态已过期，请重新登录。");
    }

    return { id: payload.sub };
  }

  const rawUserId = headers["x-user-id"];
  const userId = (Array.isArray(rawUserId) ? rawUserId[0] : rawUserId)?.trim();

  if (!allowInsecureUserHeader()) {
    throw new UnauthorizedException("Missing bearer session token");
  }

  if (!userId) {
    throw new UnauthorizedException("Missing X-User-Id header");
  }

  if (!isUuid(userId)) {
    throw new UnauthorizedException("Invalid X-User-Id header");
  }

  return { id: userId };
}

function bearerToken(rawAuthorization: string | string[] | undefined): string | null {
  const authorization = Array.isArray(rawAuthorization) ? rawAuthorization[0] : rawAuthorization;
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function allowInsecureUserHeader(): boolean {
  return process.env.AUTH_ALLOW_INSECURE_USER_HEADER === "true" || process.env.NODE_ENV !== "production";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
