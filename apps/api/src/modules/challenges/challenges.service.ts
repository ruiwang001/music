import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PLAN_LIMITS, type Plan } from "../../common/domain/plans";
import { DbService } from "../../common/db/db.service";

interface ChallengeRow {
  id: string;
  title: string;
  theme: string;
  description: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  min_plan: Plan;
  reward_points: number;
  submission_count: string;
}

interface LeaderboardRow {
  rank: string;
  song_id: string;
  title: string;
  creator_name: string;
  score: number;
  likes_count: number;
}

interface UserPlanRow {
  plan: Plan;
  plan_expires_at: Date | string | null;
}

@Injectable()
export class ChallengesService {
  constructor(private readonly db: DbService) {}

  async getDaily(userId: string) {
    await this.db.ensureUser(userId);

    const challenge = await this.db.one<ChallengeRow>(
      `select
         c.id, c.title, c.theme, c.description, c.starts_at, c.ends_at, c.min_plan, c.reward_points,
         count(cs.id)::text as submission_count
       from challenges c
       left join challenge_submissions cs on cs.challenge_id = c.id
       where c.is_active = true
         and c.starts_at <= now()
         and c.ends_at > now()
       group by c.id
       order by c.starts_at desc
       limit 1`
    );

    if (!challenge) {
      return {
        id: "",
        title: "今日挑战暂未开放",
        theme: "稍后回来查看新的每日主题",
        mood: "calm",
        styleHint: "创作者挑战",
        minPlan: "free",
        rewardPoints: 0,
        endsAt: new Date().toISOString(),
        submissionCount: 0,
        leaderboard: []
      };
    }

    return this.mapChallengeWithLeaderboard(challenge);
  }

  async submit(userId: string, challengeId: string, songId: string) {
    await this.db.ensureUser(userId);

    const challenge = await this.db.one<ChallengeRow>(
      `select
         c.id, c.title, c.theme, c.description, c.starts_at, c.ends_at, c.min_plan, c.reward_points,
         count(cs.id)::text as submission_count
       from challenges c
       left join challenge_submissions cs on cs.challenge_id = c.id
       where c.id = $1 and c.is_active = true and c.starts_at <= now() and c.ends_at > now()
       group by c.id`,
      [challengeId]
    );

    if (!challenge) {
      throw new NotFoundException("当前挑战不存在或已结束");
    }

    if (strictChallengePlanGate()) {
      await this.assertPlanAllowed(userId, challenge.min_plan);
    }

    await this.db.transaction(async (client) => {
      const song = await client.query<{ id: string }>(
        `select id from songs where id = $1 and user_id = $2`,
        [songId, userId]
      );

      if (!song.rows[0]) {
        throw new NotFoundException("作品不存在或已下架");
      }

      await client.query(
        `update songs
         set visibility = 'public',
             is_submitted_to_challenge = true,
             published_at = coalesce(published_at, now())
         where id = $1`,
        [songId]
      );

      const existingSubmission = await client.query<{ id: string }>(
        `select id
         from challenge_submissions
         where challenge_id = $1 and user_id = $2
         for update`,
        [challengeId, userId]
      );

      if (existingSubmission.rows[0]) {
        await client.query(
          `update challenge_submissions
           set song_id = $2, score = 0, created_at = now()
           where id = $1`,
          [existingSubmission.rows[0].id, songId]
        );
      } else {
        await client.query(
          `insert into challenge_submissions (challenge_id, song_id, user_id, score)
           values ($1, $2, $3, 0)`,
          [challengeId, songId, userId]
        );
      }
    });

    const refreshed = await this.db.one<ChallengeRow>(
      `select
         c.id, c.title, c.theme, c.description, c.starts_at, c.ends_at, c.min_plan, c.reward_points,
         count(cs.id)::text as submission_count
       from challenges c
       left join challenge_submissions cs on cs.challenge_id = c.id
       where c.id = $1
       group by c.id`,
      [challengeId]
    );

    if (!refreshed) {
      throw new NotFoundException("挑战不存在");
    }

    return this.mapChallengeWithLeaderboard(refreshed);
  }

  private async assertPlanAllowed(userId: string, minPlan: Plan) {
    const row = await this.db.one<UserPlanRow>(
      `select plan, plan_expires_at from users where id = $1`,
      [userId]
    );
    const plan = row?.plan_expires_at && new Date(row.plan_expires_at).getTime() < Date.now() ? "free" : (row?.plan ?? "free");

    if (!planMeetsMinimum(plan, minPlan)) {
      throw new ForbiddenException(`${minPlan} plan is required to join this challenge`);
    }

    if (!PLAN_LIMITS[plan].canJoinRewards && minPlan === "creator") {
      throw new ForbiddenException("需要创作者版才能参加奖励挑战");
    }
  }

  private async mapChallengeWithLeaderboard(challenge: ChallengeRow) {
    const leaderboard = await this.db.query<LeaderboardRow>(
      `select
         row_number() over (order by greatest(cs.score, s.likes_count) desc, cs.created_at asc)::text as rank,
         s.id as song_id,
         s.title,
         u.display_name as creator_name,
         greatest(cs.score, s.likes_count) as score,
         s.likes_count
       from challenge_submissions cs
       join songs s on s.id = cs.song_id
       join users u on u.id = cs.user_id
       where cs.challenge_id = $1
       order by greatest(cs.score, s.likes_count) desc, cs.created_at asc
       limit 20`,
      [challenge.id]
    );

    return {
      id: challenge.id,
      title: localizeChallengeText(challenge.title),
      theme: localizeChallengeText(challenge.theme),
      mood: "开放创作",
      styleHint: challenge.description ? localizeChallengeText(challenge.description) : "任意风格，作品需为原创",
      minPlan: challenge.min_plan,
      rewardPoints: challenge.reward_points,
      endsAt: toIso(challenge.ends_at),
      submissionCount: Number(challenge.submission_count),
      leaderboard: leaderboard.map((entry) => ({
        rank: Number(entry.rank),
        songId: entry.song_id,
        title: entry.title,
        creatorName: entry.creator_name,
        score: entry.score,
        likesCount: entry.likes_count
      }))
    };
  }
}

function planMeetsMinimum(plan: Plan, minPlan: Plan): boolean {
  const rank: Record<Plan, number> = { free: 0, pro: 1, creator: 2 };
  return rank[plan] >= rank[minPlan];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function localizeChallengeText(value: string): string {
  const normalized = value.trim();
  const dictionary: Record<string, string> = {
    "Daily Spark": "每日灵感",
    "A hopeful song for a city waking up": "为正在醒来的城市写一首充满希望的歌",
    "Use the daily theme to create an original track. Top entries earn Melody Points after review.": "使用每日主题创作原创歌曲。优质投稿通过审核后可获得积分奖励。",
    "Creator challenges": "创作者挑战"
  };

  return dictionary[normalized] ?? value;
}

function strictChallengePlanGate(): boolean {
  return process.env.STRICT_CHALLENGE_PLAN_GATE === "true";
}
