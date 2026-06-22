import "reflect-metadata";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const dbDir = path.join(os.tmpdir(), `green-sonic-auth-qa-${Date.now()}-${Math.random().toString(16).slice(2)}`);

process.env.NODE_ENV = "production";
process.env.AUTH_SESSION_SECRET = "green-sonic-auth-qa-session-secret";
process.env.DATABASE_URL = `pglite://${dbDir}`;
process.env.RUN_GENERATION_INLINE = "true";
process.env.ALLOW_MINIMAX_MOCK = "true";
process.env.ALLOW_DATA_URL_STORAGE = "true";

const appModulePath = path.join(root, "apps/api/dist/app.module.js");
if (!existsSync(appModulePath)) {
  console.error("API build output is missing. Run `npm --workspace apps/api run build` before `npm run qa:auth`.");
  process.exit(1);
}

const { NestFactory } = require("@nestjs/core");
const { UnauthorizedException } = require("@nestjs/common");
const { AppModule } = require(appModulePath);
const { AuthService } = require(path.join(root, "apps/api/dist/modules/auth/auth.service.js"));
const { verifySessionToken } = require(path.join(root, "apps/api/dist/common/auth/session-token.js"));
const { resolveCurrentUserFromHeaders } = require(path.join(root, "apps/api/dist/common/auth/current-user.decorator.js"));

const checks = [];
let app;

try {
  app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const auth = app.get(AuthService);
  const stamp = Date.now();
  const alice = await auth.register({ email: `alice-${stamp}@example.com`, password: "QaPass12345", displayName: "QA Alice" });
  const bob = await auth.register({ email: `bob-${stamp}@example.com`, password: "QaPass12345", displayName: "QA Bob" });
  const guest = await auth.guest();

  assert(typeof alice.token === "string" && alice.token.split(".").length === 3, "register returns signed session token");
  assert(verifySessionToken(alice.token)?.sub === alice.user.id, "registered session token verifies locally");
  assert(typeof guest.token === "string" && guest.user.email === null, "guest session can be created without form login");
  assert(verifySessionToken(guest.token)?.sub === guest.user.id, "guest token verifies locally");

  expectUnauthorized("no bearer cannot resolve current user", () => resolveCurrentUserFromHeaders({}));
  expectUnauthorized("forged X-User-Id is rejected in production", () => resolveCurrentUserFromHeaders({ "x-user-id": bob.user.id }));
  expectUnauthorized("invalid bearer token is rejected", () => resolveCurrentUserFromHeaders({ authorization: "Bearer gsg1.invalid.invalid" }));

  const resolved = resolveCurrentUserFromHeaders({
    authorization: `Bearer ${alice.token}`,
    "x-user-id": bob.user.id
  });
  assert(resolved.id === alice.user.id, "valid bearer token wins over forged X-User-Id");

  const aliceMe = await auth.getMe(resolved.id);
  assert(aliceMe.user.id === alice.user.id, "resolved bearer user can reload through getMe");
  await expectRejected("default demo login is disabled in production", () =>
    auth.login({ email: "test@greensonic.ai", password: "12345678" })
  );

  console.log(JSON.stringify({ status: "passed", checks, usersCreated: 3 }, null, 2));
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

function expectUnauthorized(label, callback) {
  try {
    callback();
  } catch (error) {
    assert(error instanceof UnauthorizedException || error?.status === 401, `${label} -> 401`);
    return;
  }
  throw new Error(label);
}

async function expectRejected(label, callback) {
  try {
    await callback();
  } catch (error) {
    assert(error?.status === 401, `${label} -> 401`);
    return;
  }
  throw new Error(label);
}

function assert(condition, label) {
  checks.push({ label, ok: Boolean(condition) });
  if (!condition) {
    throw new Error(label);
  }
}
