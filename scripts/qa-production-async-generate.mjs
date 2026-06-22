import "reflect-metadata";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const dbDir = path.join(os.tmpdir(), `green-sonic-production-async-qa-${Date.now()}-${Math.random().toString(16).slice(2)}`);

process.env.NODE_ENV = "production";
process.env.AUTH_SESSION_SECRET = "green-sonic-production-async-qa-secret";
process.env.DATABASE_URL = `pglite://${dbDir}`;
process.env.RUN_GENERATION_INLINE = "true";
process.env.ALLOW_MINIMAX_MOCK = "true";
process.env.ALLOW_DATA_URL_STORAGE = "true";

const appModulePath = path.join(root, "apps/api/dist/app.module.js");
if (!existsSync(appModulePath)) {
  console.error("API build output is missing. Run `npm --workspace apps/api run build` before `npm run qa:production-async`.");
  process.exit(1);
}

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require(appModulePath);
const { AuthService } = require(path.join(root, "apps/api/dist/modules/auth/auth.service.js"));
const { MusicService } = require(path.join(root, "apps/api/dist/modules/music/music.service.js"));

let app;

try {
  app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const auth = app.get(AuthService);
  const music = app.get(MusicService);
  const guest = await auth.guest();
  const startedAt = Date.now();
  const response = await music.generate(guest.user.id, {
    title: "Production Async QA",
    theme: "海边喝咖啡，清晨雾气慢慢散开",
    style: "Ambient",
    mood: "自由",
    mode: "instrumental",
    lyricsOptimizer: true
  });
  const durationMs = Date.now() - startedAt;
  const task = await waitForTaskCompletion(() => music.getTask(guest.user.id, response.task.id));
  const passed = durationMs < 1200 && response.task.status === "queued" && task.status === "succeeded";

  console.log(
    JSON.stringify(
      {
        status: passed ? "passed" : "failed",
        durationMs,
        returnedStatus: response.task.status,
        finalStatus: task.status,
        taskId: response.task.id,
        expectation: "production must create the task quickly and continue generation asynchronously"
      },
      null,
      2
    )
  );

  if (!passed) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
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

async function waitForTaskCompletion(getTask) {
  let task = await getTask();
  for (let attempt = 0; attempt < 20 && (task.status === "queued" || task.status === "generating"); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    task = await getTask();
  }
  return task;
}
