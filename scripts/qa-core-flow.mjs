import "reflect-metadata";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mode = process.argv.includes("--mock") ? "mock" : "real";
const root = path.resolve(new URL("..", import.meta.url).pathname);
const dbDir = path.join(os.tmpdir(), `green-sonic-core-qa-${mode}-${Date.now()}-${Math.random().toString(16).slice(2)}`);

process.env.AUTH_SESSION_SECRET = "green-sonic-core-qa-session-secret";
process.env.DATABASE_URL = `pglite://${dbDir}`;
process.env.RUN_GENERATION_INLINE = "true";
process.env.ALLOW_DATA_URL_STORAGE = "true";
if (mode === "mock") {
  process.env.ALLOW_MINIMAX_MOCK = "true";
}

const appModulePath = path.join(root, "apps/api/dist/app.module.js");
if (!existsSync(appModulePath)) {
  console.error("API build output is missing. Run `npm --workspace apps/api run build` before `npm run qa:core:mock`.");
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
  const stamp = Date.now();
  const email = `qa-${mode}-${stamp}@example.com`;
  const password = "QaPass12345";

  const registered = await auth.register({
    email,
    password,
    displayName: mode === "mock" ? "QA Saved Creator" : "QA Real Creator"
  });
  const loggedIn = await auth.login({ email, password });
  const generated = await music.generate(loggedIn.user.id, {
    title: mode === "mock" ? "QA Saved Song" : "QA Real Green Song",
    theme: "雨后绿色美术馆里的一束光，温柔但有生命力",
    style: "Art Pop",
    mood: "希望",
    mode: "instrumental",
    lyricsOptimizer: true
  });
  const task = await music.getTask(loggedIn.user.id, generated.task.id);
  const songs = await music.getMySongs(loggedIn.user.id);
  const tasks = await music.getMyTasks(loggedIn.user.id);

  const result = {
    mode,
    registered: Boolean(registered.user.id),
    loginMatches: registered.user.id === loggedIn.user.id,
    taskStatus: task.status,
    errorMessage: task.errorMessage,
    songCount: songs.length,
    taskCount: tasks.length,
    hasSongId: Boolean(task.songId),
    hasAudio: Boolean(task.audioUrl || songs[0]?.audioUrl),
    savedSongTitle: songs[0]?.title ?? null
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.registered || !result.loginMatches || task.status !== "succeeded" || songs.length < 1 || !result.hasAudio) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        mode,
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        status: typeof error === "object" && error !== null && "status" in error ? error.status : undefined,
        details: typeof error === "object" && error !== null && "details" in error ? error.details : undefined
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
