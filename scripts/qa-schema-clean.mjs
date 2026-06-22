import "reflect-metadata";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const dbDir = path.join(os.tmpdir(), `green-sonic-schema-qa-${Date.now()}-${Math.random().toString(16).slice(2)}`);

process.env.NODE_ENV = "test";
process.env.AUTH_SESSION_SECRET = "green-sonic-schema-qa-session-secret";
process.env.DATABASE_URL = `pglite://${dbDir}`;

const appModulePath = path.join(root, "apps/api/dist/app.module.js");
if (!existsSync(appModulePath)) {
  console.error("API build output is missing. Run `npm --workspace apps/api run build` before `npm run qa:schema`.");
  process.exit(1);
}

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require(appModulePath);
const { DbService } = require(path.join(root, "apps/api/dist/common/db/db.service.js"));

const checks = [];
let app;

try {
  app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const db = app.get(DbService);

  const tables = await db.query(
    `select table_name
     from information_schema.tables
     where table_schema = 'public'
     order by table_name`
  );
  const tableNames = new Set(tables.map((row) => row.table_name));
  [
    "users",
    "music_tasks",
    "songs",
    "likes",
    "favorites",
    "comments",
    "comment_likes",
    "song_view_events",
    "song_play_events",
    "follows",
    "challenges",
    "challenge_submissions",
    "points_ledger",
    "reward_withdrawals",
    "iap_orders",
    "minimax_api_logs",
    "admin_audit_logs",
    "app_settings",
    "user_sessions"
  ].forEach((table) => assert(tableNames.has(table), `table exists: ${table}`));

  const songColumns = await db.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public' and table_name = 'songs'`
  );
  const songColumnNames = new Set(songColumns.map((row) => row.column_name));
  ["view_count", "play_count", "comments_count"].forEach((column) => assert(songColumnNames.has(column), `songs.${column} exists`));

  const sessionColumns = await db.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public' and table_name = 'user_sessions'`
  );
  const sessionColumnNames = new Set(sessionColumns.map((row) => row.column_name));
  ["session_fingerprint", "platform", "user_agent", "request_count", "first_seen_at", "last_seen_at"].forEach((column) =>
    assert(sessionColumnNames.has(column), `user_sessions.${column} exists`)
  );

  const settings = await db.query("select key, value from app_settings order by key");
  const settingsMap = new Map(settings.map((row) => [row.key, Number(row.value)]));
  assert(settingsMap.get("points_per_usdc") === 10, "default points_per_usdc is 10");
  assert(settingsMap.get("min_withdrawal_points") === 10, "default min_withdrawal_points is 10");
  assert(settingsMap.get("publish_reward_points") === 25, "default publish_reward_points is 25");

  console.log(JSON.stringify({ status: "passed", checks, tableCount: tableNames.size }, null, 2));
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
