import "reflect-metadata";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const dbDir = path.join(os.tmpdir(), `green-sonic-iap-qa-${Date.now()}-${Math.random().toString(16).slice(2)}`);

process.env.NODE_ENV = "production";
process.env.AUTH_SESSION_SECRET = "green-sonic-iap-qa-session-secret";
process.env.DATABASE_URL = `pglite://${dbDir}`;
process.env.RUN_GENERATION_INLINE = "true";
process.env.ALLOW_MINIMAX_MOCK = "true";
process.env.ALLOW_DATA_URL_STORAGE = "true";
delete process.env.APPLE_ROOT_CA_BASE64;
delete process.env.APPLE_ROOT_CA_FILES;
delete process.env.APPLE_BUNDLE_ID;
delete process.env.APPLE_ENVIRONMENT;
delete process.env.ALLOW_UNVERIFIED_IAP_JWS;

const appModulePath = path.join(root, "apps/api/dist/app.module.js");
if (!existsSync(appModulePath)) {
  console.error("API build output is missing. Run `npm --workspace apps/api run build` before `npm run qa:iap`.");
  process.exit(1);
}

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require(appModulePath);
const { AuthService } = require(path.join(root, "apps/api/dist/modules/auth/auth.service.js"));
const { IapService } = require(path.join(root, "apps/api/dist/modules/iap/iap.service.js"));

const checks = [];
let app;

try {
  app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const auth = app.get(AuthService);
  const iap = app.get(IapService);
  const user = await auth.register({ email: `iap-${Date.now()}@example.com`, password: "QaPass12345", displayName: "QA IAP User" });

  await expectStatus(
    "unsigned StoreKit payload is rejected",
    () =>
      iap.verify(user.user.id, {
        productId: "com.melodyai.pro.monthly",
        signedTransactionInfo: fakeJws({ productId: "com.melodyai.pro.monthly", transactionId: `fake-${Date.now()}` })
      }),
    400
  );

  await expectStatus(
    "sandbox StoreKit payload is rejected in production",
    () =>
      iap.verify(user.user.id, {
        productId: "com.melodyai.pro.monthly",
        signedTransactionInfo: "sandbox-storekit-jws.fakepayload"
      }),
    400
  );

  const me = await auth.getMe(user.user.id);
  assert(me.user.plan === "free", `rejected IAP does not upgrade plan (got ${me.user.plan})`);

  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
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

async function expectStatus(label, request, status) {
  try {
    await request();
  } catch (error) {
    assert(error?.status === status, `${label} -> ${status}`);
    return;
  }
  throw new Error(label);
}

function fakeJws(payload) {
  return [
    base64Url(JSON.stringify({ alg: "none" })),
    base64Url(JSON.stringify({ ...payload, environment: "Production", purchaseDate: Date.now() })),
    "forged-signature"
  ].join(".");
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function assert(condition, label) {
  checks.push({ label, ok: Boolean(condition) });
  if (!condition) {
    throw new Error(label);
  }
}
