import "reflect-metadata";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const dbDir = path.join(os.tmpdir(), `green-sonic-guest-qa-${Date.now()}-${Math.random().toString(16).slice(2)}`);

process.env.NODE_ENV = "production";
process.env.AUTH_SESSION_SECRET = "green-sonic-guest-qa-session-secret";
process.env.DATABASE_URL = `pglite://${dbDir}`;
process.env.RUN_GENERATION_INLINE = "true";
process.env.ALLOW_MINIMAX_MOCK = "true";
process.env.ALLOW_DATA_URL_STORAGE = "true";

const appModulePath = path.join(root, "apps/api/dist/app.module.js");
if (!existsSync(appModulePath)) {
  console.error("API build output is missing. Run `npm --workspace apps/api run build` before `npm run qa:guest`.");
  process.exit(1);
}

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require(appModulePath);
const { AuthService } = require(path.join(root, "apps/api/dist/modules/auth/auth.service.js"));
const { verifySessionToken } = require(path.join(root, "apps/api/dist/common/auth/session-token.js"));

const checks = [];
let app;

try {
  app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const auth = app.get(AuthService);
  const guest = await auth.guest();
  const payload = verifySessionToken(guest.token);
  const me = await auth.getMe(guest.user.id);

  assert(typeof guest.token === "string" && guest.token.split(".").length === 3, "guest receives signed session token");
  assert(typeof guest.user.id === "string" && guest.user.id.length > 20, "guest receives stable user id");
  assert(guest.user.email === null, "guest account does not require email");
  assert(guest.user.plan === "free", "guest defaults to free plan in production no-login MVP");
  assert(payload?.sub === guest.user.id, "guest token verifies against created user");
  assert(me.user.id === guest.user.id, "guest identity can reload through getMe");
  assert(me.user.displayName === guest.user.displayName, "guest display name is persisted");

  console.log(
    JSON.stringify(
      {
        status: "passed",
        checks,
        userId: guest.user.id,
        displayName: guest.user.displayName
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        checks,
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  if (app) {
    await app.close();
  }
  await rm(dbDir, { recursive: true, force: true });
}

function assert(condition, label) {
  checks.push({ label, ok: Boolean(condition) });
  if (!condition) {
    throw new Error(label);
  }
}
