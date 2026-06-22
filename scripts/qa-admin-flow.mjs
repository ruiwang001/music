import "reflect-metadata";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const dbDir = path.join(os.tmpdir(), `green-sonic-admin-qa-${Date.now()}-${Math.random().toString(16).slice(2)}`);

process.env.ALLOW_MINIMAX_MOCK = "true";
process.env.ALLOW_DATA_URL_STORAGE = "true";
process.env.AUTH_SESSION_SECRET = "green-sonic-admin-qa-session-secret";
process.env.DATABASE_URL = `pglite://${dbDir}`;
process.env.GUEST_DEFAULT_PLAN = "creator";
process.env.RUN_GENERATION_INLINE = "true";

const appModulePath = path.join(root, "apps/api/dist/app.module.js");
if (!existsSync(appModulePath)) {
  console.error("API build output is missing. Run `npm --workspace apps/api run build` before `npm run qa:admin`.");
  process.exit(1);
}

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require(appModulePath);
const { AuthService } = require(path.join(root, "apps/api/dist/modules/auth/auth.service.js"));
const { MusicService } = require(path.join(root, "apps/api/dist/modules/music/music.service.js"));
const { RewardService } = require(path.join(root, "apps/api/dist/modules/reward/reward.service.js"));
const { AdminService } = require(path.join(root, "apps/api/dist/modules/admin/admin.service.js"));
const { DbService } = require(path.join(root, "apps/api/dist/common/db/db.service.js"));

const checks = [];
let app;

try {
  app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const auth = app.get(AuthService);
  const music = app.get(MusicService);
  const rewards = app.get(RewardService);
  const admin = app.get(AdminService);
  const db = app.get(DbService);

  const session = await auth.guest(mockRequest("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iOS"));
  await auth.getMe(session.user.id, mockRequest("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iOS"));

  const users = await admin.getUsers();
  const qaUser = users.find((user) => user.id === session.user.id);
  assert(Boolean(qaUser), "admin user list includes guest creator");
  assert((qaUser?.deviceCount ?? 0) >= 1, "admin user device count is tracked");
  assert(qaUser?.platforms.includes("iOS"), "admin user platform is tracked");

  const updatedSettings = await admin.updateSettings({
    pointsPerUsdc: 20,
    minWithdrawalPoints: 40,
    publishRewardPoints: 60
  });
  assert(updatedSettings.pointsPerUsdc === 20, "admin can update points to USDC ratio");
  assert(updatedSettings.minWithdrawalPoints === 40, "admin can update minimum withdrawal threshold");
  assert(updatedSettings.publishRewardPoints === 60, "admin can update publish reward points");

  const generated = await music.generate(session.user.id, {
    title: "Admin QA Song",
    theme: "验证后台歌曲管理和动态积分配置。",
    style: "Art Pop",
    mood: "希望",
    mode: "instrumental",
    lyricsOptimizer: true
  });
  assert(Boolean(generated.task.songId), "admin QA song generation creates a song");

  const taskAudits = await admin.getMusicTasks();
  const generatedAudit = taskAudits.find((task) => task.id === generated.task.id);
  assert(Boolean(generatedAudit), "admin generation records include generated task");
  assert(generatedAudit?.userId === session.user.id, "admin generation record links to user");
  assert(Boolean(generatedAudit?.userDisplayName), "admin generation record includes user display name");
  assert(generatedAudit?.status === "succeeded", "admin generation record shows success status");
  assert(generatedAudit?.isSuccessful === true, "admin generation record marks successful generation");
  assert(generatedAudit?.hasGeneratedSong === true, "admin generation record marks generated song");
  assert(generatedAudit?.songId === generated.task.songId, "admin generation record links generated song");
  assert(Boolean(generatedAudit?.songAudioUrl), "admin generation record exposes generated audio");

  const published = await music.publish(session.user.id, { songId: generated.task.songId });
  assert(published.awardedPoints === 60, "publish reward follows admin setting");

  const history = await rewards.getHistory(session.user.id);
  assert(history.settings.pointsPerUsdc === 20, "PWA reward history reads admin ratio");
  assert(history.settings.minWithdrawalPoints === 40, "PWA reward history reads admin withdrawal threshold");

  await expectFailure(
    () => rewards.claim(session.user.id, { walletAddress: "0x1111111111111111111111111111111111111111", amountPoints: 20 }),
    "withdrawal below admin threshold is rejected"
  );

  const withdrawal = await rewards.claim(session.user.id, {
    walletAddress: "0x1111111111111111111111111111111111111111",
    amountPoints: 40
  });
  assert(withdrawal.usdcAmount === 2, "withdrawal amount follows admin ratio");

  const songs = await admin.getSongs();
  const adminSong = songs.find((song) => song.id === generated.task.songId);
  assert(Boolean(adminSong), "admin song list includes generated song");
  assert(adminSong?.visibility === "public", "admin song list shows public status");

  const hiddenSong = await admin.updateSong(generated.task.songId, {
    visibility: "private",
    moderationNote: "QA hide song"
  });
  assert(hiddenSong.visibility === "private", "admin can hide a song from the gallery");

  const overview = await admin.getOverview();
  assert(overview.usersCount >= 1, "admin overview includes users");
  assert(overview.songsCount >= 1, "admin overview includes songs");
  assert(overview.settings.pointsPerUsdc === 20, "admin overview includes platform settings");

  const audit = await db.query("select action from admin_audit_logs where action in ('update_platform_settings', 'moderate_song')");
  assert(audit.length >= 2, "admin writes audit logs for settings and moderation");

  console.log(
    JSON.stringify(
      {
        status: "passed",
        checks,
        userId: session.user.id,
        songId: generated.task.songId,
        withdrawalId: withdrawal.id,
        settings: updatedSettings
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
        error: error instanceof Error ? error.message : String(error)
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

function mockRequest(userAgent, platform) {
  return {
    headers: {
      "user-agent": userAgent,
      "sec-ch-ua-platform": `"${platform}"`,
      "x-forwarded-for": "127.0.0.1"
    },
    ip: "127.0.0.1"
  };
}

function assert(condition, label) {
  checks.push({ label, ok: Boolean(condition) });
  if (!condition) {
    throw new Error(label);
  }
}

async function expectFailure(fn, label) {
  try {
    await fn();
  } catch {
    assert(true, label);
    return;
  }
  assert(false, label);
}
