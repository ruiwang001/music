import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const rawKey = request.headers["x-admin-key"];
    const adminKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
      throw new UnauthorizedException("Invalid admin key");
    }

    return true;
  }
}
