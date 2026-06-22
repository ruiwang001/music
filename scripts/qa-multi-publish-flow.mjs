import "reflect-metadata";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const dbDir = path.join(os.tmpdir(), `green-sonic-multi-publish-qa-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const publishRewardPoints = 25;
const songCount = 3;

process.env.RUN_GENERATION_INLINE = "true";
process.env.ALLOW_MINIMAX_MOCK = "true";
process.env.ALLOW_DATA_URL_STORAGE = "true";
process.env.AUTH_SESSION_SECRET = "green-sonic-multi-publish-qa-session-secret";
process.env.DATABASE_URL = `pglite://${dbDir}`;
process.env.GUEST_DEFAULT_PLAN = "creator";

const appModulePath = path.join(root, "apps/api/dist/app.module.js");
if (!existsSync(appModulePath)) {
  console.error("API build output is missing. Run `npm --workspace apps/api run build` before `npm run qa:multi-publish`.");
  process.exit(1);
}

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require(appModulePath);
const { AuthService } = require(path.join(root, "apps/api/dist/modules/auth/auth.service.js"));
const { MusicService } = require(path.join(root, "apps/api/dist/modules/music/music.service.js"));
const { FeedService } = require(path.join(root, "apps/api/dist/modules/feed/feed.service.js"));
const { RewardService } = require(path.join(root, "apps/api/dist/modules/reward/reward.service.js"));

const checks = [];
let app;

try {
  app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const auth = app.get(AuthService);
  const music = app.get(MusicService);
  const feed = app.get(FeedService);
  const rewards = app.get(RewardService);

  const creator = await auth.guest();
  const listener = await auth.guest();
  assert(creator.user.plan === "creator", "guest creator can test multiple generated songs without login");

  const generatedSongs = [];
  for (let index = 1; index <= songCount; index += 1) {
    const generated = await music.generate(creator.user.id, {
      title: `QA Multi Publish ${index}`,
      theme: `第 ${index} 首绿色声波极光测试歌，检查多首发布、广场和积分逻辑。`,
      style: index === 1 ? "Art Pop" : index === 2 ? "Future Funk" : "Ambient",
      mood: index === 1 ? "希望" : index === 2 ? "自由" : "沉静",
      mode: index === 2 ? "instrumental" : "vocal",
      lyrics: index === 2 ? "" : `这是第 ${index} 首测试歌 / 发布后应该进入广场`,
      lyricsOptimizer: true
    });
    assert(generated.task.status === "succeeded", `song ${index} generation succeeds`);
    assert(Boolean(generated.task.songId), `song ${index} has saved song id`);
    generatedSongs.push(generated.task.songId);
  }

  const publishResponses = [];
  for (const songId of generatedSongs) {
    publishResponses.push(await music.publish(creator.user.id, { songId }));
  }

  publishResponses.forEach((response, index) => {
    assert(response.song.visibility === "public", `song ${index + 1} becomes public`);
    assert(response.awardedPoints === publishRewardPoints, `song ${index + 1} first publish awards ${publishRewardPoints} points`);
  });

  const duplicatePublish = await music.publish(creator.user.id, { songId: generatedSongs[0] });
  assert(duplicatePublish.song.visibility === "public", "duplicate publish keeps song public");
  assert(duplicatePublish.awardedPoints === 0, "duplicate publish does not award points again");

  const creatorSongs = await music.getMySongs(creator.user.id);
  const publishedCreatorSongs = creatorSongs.filter((song) => generatedSongs.includes(song.id) && song.visibility === "public");
  assert(publishedCreatorSongs.length === songCount, "all generated songs are public in creator library");

  const creatorFeed = await feed.getFeed(creator.user.id);
  const creatorFeedIds = new Set(creatorFeed.map((song) => song.id));
  assert(generatedSongs.every((songId) => creatorFeedIds.has(songId)), "creator feed includes every published song");

  const listenerFeed = await feed.getFeed(listener.user.id);
  const listenerFeedIds = new Set(listenerFeed.map((song) => song.id));
  assert(generatedSongs.every((songId) => listenerFeedIds.has(songId)), "another user can see every published song");

  const viewed = await music.recordView(listener.user.id, generatedSongs[0]);
  assert(viewed.viewCount === 1, "another user opening detail increments view count");
  const duplicateView = await music.recordView(listener.user.id, generatedSongs[0]);
  assert(duplicateView.viewCount === 1, "duplicate view by same user does not inflate count");

  const played = await music.recordPlay(listener.user.id, generatedSongs[0]);
  assert(played.playCount === 1, "another user playing audio increments play count");
  const duplicatePlay = await music.recordPlay(listener.user.id, generatedSongs[0]);
  assert(duplicatePlay.playCount === 1, "duplicate play by same user does not inflate count");

  const feedAfterPlayback = await feed.getFeed(listener.user.id);
  const playedFeedItem = feedAfterPlayback.find((song) => song.id === generatedSongs[0]);
  assert(playedFeedItem?.viewCount === 1, "feed exposes updated view count");
  assert(playedFeedItem?.playCount === 1, "feed exposes updated play count");

  const liked = await feed.toggleReaction(listener.user.id, generatedSongs[0], "like", true);
  assert(liked.likedByMe === true, "another user can like published song");
  assert(liked.likesCount === 1, "like count increments once");

  const likedAgain = await feed.toggleReaction(listener.user.id, generatedSongs[0], "like", true);
  assert(likedAgain.likesCount === 1, "duplicate like does not inflate count");

  const favorited = await feed.toggleReaction(listener.user.id, generatedSongs[1], "favorite", true);
  assert(favorited.favoritedByMe === true, "another user can favorite published song");
  assert(favorited.favoritesCount === 1, "favorite count increments once");

  const commentResult = await music.createComment(listener.user.id, {
    songId: generatedSongs[0],
    body: "这首歌的氛围很完整，适合发布到广场。"
  });
  assert(Boolean(commentResult.comment.id), "another user can comment on published song");
  assert(commentResult.commentsCount === 1, "song comment count increments once");

  const commentLike = await music.toggleCommentLike(creator.user.id, commentResult.comment.id, { liked: true });
  assert(commentLike.comment.likedByMe === true, "creator can like another user's comment");
  assert(commentLike.comment.likesCount === 1, "comment like count increments once");

  const creatorProfileBeforeFollow = await feed.getCreatorProfile(listener.user.id, creator.user.id);
  assert(creatorProfileBeforeFollow.songs.length === songCount, "creator profile exposes public songs");
  assert(creatorProfileBeforeFollow.creator.totalPlayCount >= 1, "creator profile exposes total play count");

  const followedCreator = await feed.toggleFollow(listener.user.id, creator.user.id, true);
  assert(followedCreator.creator.followedByMe === true, "another user can follow creator");
  assert(followedCreator.creator.followersCount === 1, "creator follower count increments once");

  const history = await rewards.getHistory(creator.user.id);
  const expectedPoints = songCount * publishRewardPoints;
  const publishLedger = history.ledger.filter((entry) => entry.source === "publish_song" && entry.delta === publishRewardPoints);
  assert(history.balance === expectedPoints, `creator balance is ${expectedPoints} after publishing ${songCount} songs`);
  assert(history.lifetimeEarned === expectedPoints, `creator lifetime earned is ${expectedPoints}`);
  assert(publishLedger.length === songCount, "ledger has exactly one publish reward per song");

  console.log(
    JSON.stringify(
      {
        status: "passed",
        checks,
        generatedSongs,
        awardedPoints: publishResponses.map((response) => response.awardedPoints),
        duplicateAwardedPoints: duplicatePublish.awardedPoints,
        creatorFeedCount: creatorFeed.length,
        listenerFeedCount: listenerFeed.length,
        firstSongViewCount: playedFeedItem?.viewCount,
        firstSongPlayCount: playedFeedItem?.playCount,
        firstCommentLikes: commentLike.comment.likesCount,
        creatorFollowers: followedCreator.creator.followersCount,
        balance: history.balance,
        publishLedgerCount: publishLedger.length
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
