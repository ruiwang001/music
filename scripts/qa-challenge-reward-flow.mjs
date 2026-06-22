import "reflect-metadata";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const dbDir = path.join(os.tmpdir(), `green-sonic-challenge-reward-qa-${Date.now()}-${Math.random().toString(16).slice(2)}`);

process.env.RUN_GENERATION_INLINE = "true";
process.env.ALLOW_MINIMAX_MOCK = "true";
process.env.ALLOW_DATA_URL_STORAGE = "true";
process.env.AUTH_SESSION_SECRET = "green-sonic-challenge-reward-qa-session-secret";
process.env.DATABASE_URL = `pglite://${dbDir}`;
process.env.GUEST_DEFAULT_PLAN = "creator";

const appModulePath = path.join(root, "apps/api/dist/app.module.js");
if (!existsSync(appModulePath)) {
  console.error("API build output is missing. Run `npm --workspace apps/api run build` before `npm run qa:challenge-reward`.");
  process.exit(1);
}

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require(appModulePath);
const { AuthService } = require(path.join(root, "apps/api/dist/modules/auth/auth.service.js"));
const { MusicService } = require(path.join(root, "apps/api/dist/modules/music/music.service.js"));
const { ChallengesService } = require(path.join(root, "apps/api/dist/modules/challenges/challenges.service.js"));
const { RewardService } = require(path.join(root, "apps/api/dist/modules/reward/reward.service.js"));
const { AdminService } = require(path.join(root, "apps/api/dist/modules/admin/admin.service.js"));

const checks = [];
let app;

try {
  app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const auth = app.get(AuthService);
  const music = app.get(MusicService);
  const challenges = app.get(ChallengesService);
  const rewards = app.get(RewardService);
  const admin = app.get(AdminService);

  const creator = await auth.guest();
  assert(creator.user.plan === "creator", "challenge QA user has creator plan");

  const generated = await music.generate(creator.user.id, {
    title: "QA Challenge Reward Song",
    theme: "绿色声波挑战赛测试歌，验证投稿、排行榜和提现风控闭环。",
    style: "Art Pop",
    mood: "希望",
    mode: "instrumental",
    lyricsOptimizer: true
  });
  assert(generated.task.status === "succeeded" && Boolean(generated.task.songId), "challenge QA song generation succeeds");

  const published = await music.publish(creator.user.id, { songId: generated.task.songId });
  assert(published.song.visibility === "public", "challenge QA song publishes publicly");
  assert(published.awardedPoints === 25, "publishing awards initial points before withdrawal");

  const startsAt = new Date(Date.now() - 60_000).toISOString();
  const endsAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const challenge = await admin.createChallenge({
    title: "QA Daily Challenge",
    theme: "用绿色极光写一首歌",
    description: "任意风格，验证投稿闭环",
    startsAt,
    endsAt,
    minPlan: "creator",
    rewardPoints: 100,
    isActive: true
  });
  assert(Boolean(challenge.id), "admin can create active challenge");

  const daily = await challenges.getDaily(creator.user.id);
  assert(daily.id === challenge.id, "creator can read active challenge");

  const submitted = await challenges.submit(creator.user.id, challenge.id, generated.task.songId);
  assert(submitted.submissionCount === 1, "challenge submission count increments");
  assert(submitted.leaderboard.some((entry) => entry.songId === generated.task.songId), "submitted song appears on leaderboard");

  const freeCreator = await auth.register({
    email: `free-challenge-${Date.now()}@greensonic.qa`,
    password: "12345678",
    displayName: "QA Free Creator"
  });
  assert(freeCreator.user.plan === "free", "free creator can reproduce production no-login plan");

  const freeGenerated = await music.generate(freeCreator.user.id, {
    title: "QA Free Challenge Song",
    theme: "免费用户也能投稿挑战，但奖励资格由后台审核和会员体系控制。",
    style: "Indie Folk",
    mood: "轻快",
    mode: "instrumental",
    lyricsOptimizer: true
  });
  assert(freeGenerated.task.status === "succeeded" && Boolean(freeGenerated.task.songId), "free creator song generation succeeds");

  const freePublished = await music.publish(freeCreator.user.id, { songId: freeGenerated.task.songId });
  assert(freePublished.song.visibility === "public", "free creator song publishes publicly");

  const freeSubmitted = await challenges.submit(freeCreator.user.id, challenge.id, freeGenerated.task.songId);
  assert(freeSubmitted.leaderboard.some((entry) => entry.songId === freeGenerated.task.songId), "free creator can submit published song to daily challenge");

  const beforeClaim = await rewards.getHistory(creator.user.id);
  assert(beforeClaim.balance === 25, "reward balance is available before withdrawal");

  const withdrawal = await rewards.claim(creator.user.id, {
    walletAddress: "0x1111111111111111111111111111111111111111",
    amountPoints: 10
  });
  assert(withdrawal.status === "pending_review", "withdrawal enters pending review");
  assert(withdrawal.usdcAmount === 1, "10 Melody Points converts to 1 USDC");

  const pending = await admin.getWithdrawals("pending_review");
  assert(pending.some((item) => item.id === withdrawal.id), "admin can see pending withdrawal");

  const rejected = await admin.reviewWithdrawal(withdrawal.id, {
    decision: "rejected",
    riskNote: "QA rejects withdrawal to verify point refund"
  });
  assert(rejected.status === "rejected", "admin can reject withdrawal");

  const afterReject = await rewards.getHistory(creator.user.id);
  assert(afterReject.balance === 25, "rejected withdrawal refunds reserved points");
  await expectRejected("reviewed withdrawal cannot be reviewed twice", () =>
    admin.reviewWithdrawal(withdrawal.id, {
      decision: "approved",
      riskNote: "QA second review should fail"
    })
  );

  console.log(
    JSON.stringify(
      {
        status: "passed",
        checks,
        challengeId: challenge.id,
        songId: generated.task.songId,
        freeSongId: freeGenerated.task.songId,
        withdrawalId: withdrawal.id,
        balanceAfterReject: afterReject.balance
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

async function expectRejected(label, callback) {
  try {
    await callback();
  } catch (error) {
    assert(error?.status === 400, `${label} -> 400`);
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
