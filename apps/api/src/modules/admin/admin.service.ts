import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { DbService } from "../../common/db/db.service";
import { getPlatformSettings, updatePlatformSettings } from "../../common/settings/platform-settings";
import { CreateChallengeDto } from "./dto/create-challenge.dto";
import { ReviewWithdrawalDto } from "./dto/review-withdrawal.dto";
import { UpdatePlatformSettingsDto } from "./dto/update-platform-settings.dto";
import { UpdateSongAdminDto } from "./dto/update-song-admin.dto";

interface CountRow {
  count: string;
}

interface OverviewExtraRow {
  today_users: string;
  active_users_today: string;
  active_users_7d: string;
  total_points_balance: string | null;
  lifetime_points_issued: string | null;
  reserved_points: string | null;
  total_usdc_requested: string | null;
  total_plays: string | null;
  total_views: string | null;
  total_comments: string | null;
}

interface StatusCountRow {
  status: string;
  count: string;
}

interface CostRow {
  total_cost_cents: string | null;
  failed_cost_cents: string | null;
}

interface TaskAuditRow {
  id: string;
  user_id: string;
  user_display_name: string | null;
  user_email: string | null;
  title: string | null;
  status: "queued" | "generating" | "succeeded" | "failed";
  prompt: string;
  style: string;
  mood: string;
  mode: "instrumental" | "vocal";
  minimax_model: string | null;
  minimax_trace_id: string | null;
  minimax_status_code: number | null;
  estimated_cost_cents: number;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  quota_refunded: boolean;
  song_id: string | null;
  song_title: string | null;
  song_audio_url: string | null;
  song_visibility: "private" | "public" | null;
  started_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

interface WithdrawalRow {
  id: string;
  user_id: string;
  display_name: string | null;
  amount_points: number;
  usdc_amount: string | number;
  wallet_address: string;
  status: "pending_review" | "approved" | "rejected" | "paid";
  risk_note: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

type WithdrawalFilterStatus = WithdrawalRow["status"];

interface ChallengeRow {
  id: string;
  title: string;
  theme: string;
  description: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  min_plan: "free" | "pro" | "creator";
  reward_points: number;
  is_active: boolean;
  submissions_count: string;
  created_at: Date | string;
}

interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  plan: "free" | "pro" | "creator";
  risk_status: string;
  points_balance: number;
  created_at: Date | string;
  updated_at: Date | string;
  songs_count: string;
  public_songs_count: string;
  total_plays: string | null;
  total_views: string | null;
  session_count: string;
  device_count: string;
  request_count: string | null;
  platforms: string | null;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
}

interface AdminSongRow {
  id: string;
  user_id: string;
  creator_name: string;
  title: string;
  theme: string;
  style: string;
  mood: string;
  audio_url: string;
  cover_url: string | null;
  visibility: "private" | "public";
  likes_count: number;
  favorites_count: number;
  view_count: number;
  play_count: number;
  comments_count: number;
  is_submitted_to_challenge: boolean;
  created_at: Date | string;
  published_at: Date | string | null;
  updated_at: Date | string;
}

@Injectable()
export class AdminService {
  constructor(private readonly db: DbService) {}

  async getOverview() {
    await this.db.ensureRuntimeSchema();
    const [users, songs, tasks, pendingWithdrawals, costs, taskStatusRows, withdrawalStatusRows, activeChallenges, extra, settings] =
      await Promise.all([
        this.count("users"),
        this.count("songs"),
        this.count("music_tasks"),
        this.db.one<CountRow>("select count(*)::text as count from reward_withdrawals where status = 'pending_review'"),
        this.db.one<CostRow>(
          `select
             coalesce(sum(estimated_cost_cents), 0)::text as total_cost_cents,
             coalesce(sum(estimated_cost_cents) filter (where error_code is not null), 0)::text as failed_cost_cents
           from minimax_api_logs`
        ),
        this.db.query<StatusCountRow>("select status, count(*)::text as count from music_tasks group by status"),
        this.db.query<StatusCountRow>("select status, count(*)::text as count from reward_withdrawals group by status"),
        this.db.one<CountRow>(
          "select count(*)::text as count from challenges where is_active = true and starts_at <= now() and ends_at > now()"
        ),
        this.db.one<OverviewExtraRow>(
          `select
             (select count(*)::text from users where created_at >= date_trunc('day', now())) as today_users,
             (select count(distinct user_id)::text from user_sessions where last_seen_at >= date_trunc('day', now())) as active_users_today,
             (select count(distinct user_id)::text from user_sessions where last_seen_at >= now() - interval '7 days') as active_users_7d,
             (select coalesce(sum(points_balance), 0)::text from users) as total_points_balance,
             (select coalesce(sum(delta) filter (where delta > 0), 0)::text from points_ledger) as lifetime_points_issued,
             (select coalesce(sum(amount_points) filter (where status = 'pending_review'), 0)::text from reward_withdrawals) as reserved_points,
             (select coalesce(sum(usdc_amount), 0)::text from reward_withdrawals where status in ('pending_review', 'approved', 'paid')) as total_usdc_requested,
             (select coalesce(sum(play_count), 0)::text from songs) as total_plays,
             (select coalesce(sum(view_count), 0)::text from songs) as total_views,
             (select coalesce(sum(comments_count), 0)::text from songs) as total_comments`
        ),
        getPlatformSettings(this.db)
      ]);

    return {
      usersCount: users,
      todayUsersCount: Number(extra?.today_users ?? 0),
      activeUsersToday: Number(extra?.active_users_today ?? 0),
      activeUsers7d: Number(extra?.active_users_7d ?? 0),
      songsCount: songs,
      tasksCount: tasks,
      pendingWithdrawalsCount: Number(pendingWithdrawals?.count ?? 0),
      totalPointsBalance: Number(extra?.total_points_balance ?? 0),
      lifetimePointsIssued: Number(extra?.lifetime_points_issued ?? 0),
      reservedPoints: Number(extra?.reserved_points ?? 0),
      totalUsdcRequested: Number(extra?.total_usdc_requested ?? 0),
      totalPlays: Number(extra?.total_plays ?? 0),
      totalViews: Number(extra?.total_views ?? 0),
      totalComments: Number(extra?.total_comments ?? 0),
      minimaxCostCents: Number(costs?.total_cost_cents ?? 0),
      minimaxFailedCostCents: Number(costs?.failed_cost_cents ?? 0),
      taskStatusCounts: rowsToStatusMap(taskStatusRows),
      withdrawalStatusCounts: rowsToStatusMap(withdrawalStatusRows),
      activeChallengesCount: Number(activeChallenges?.count ?? 0),
      settings
    };
  }

  async getMusicTasks() {
    const rows = await this.db.query<TaskAuditRow>(
      `select
         mt.id, mt.user_id, u.display_name as user_display_name, u.email as user_email,
         mt.title, mt.status, mt.prompt, mt.style, mt.mood, mt.mode,
         mt.minimax_model, mt.minimax_trace_id, mt.minimax_status_code, mt.estimated_cost_cents,
         log.duration_ms, mt.error_code, mt.error_message, mt.quota_refunded,
         s.id as song_id, s.title as song_title, s.audio_url as song_audio_url, s.visibility as song_visibility,
         mt.started_at, mt.created_at, mt.updated_at, mt.completed_at
       from music_tasks mt
       join users u on u.id = mt.user_id
       left join songs s on s.task_id = mt.id
       left join lateral (
         select duration_ms
         from minimax_api_logs
         where task_id = mt.id
         order by created_at desc
         limit 1
       ) log on true
       order by mt.created_at desc
       limit 200`
    );

    return rows.map(mapTask);
  }

  async getUsers() {
    await this.db.ensureRuntimeSchema();
    const rows = await this.db.query<AdminUserRow>(
      `select
         u.id, u.email, u.display_name, u.avatar_url, u.plan, u.risk_status, u.points_balance,
         u.created_at, u.updated_at,
         coalesce(song_stats.songs_count, '0') as songs_count,
         coalesce(song_stats.public_songs_count, '0') as public_songs_count,
         coalesce(song_stats.total_plays, '0') as total_plays,
         coalesce(song_stats.total_views, '0') as total_views,
         coalesce(session_stats.session_count, '0') as session_count,
         coalesce(session_stats.device_count, '0') as device_count,
         coalesce(session_stats.request_count, '0') as request_count,
         session_stats.platforms,
         session_stats.first_seen_at,
         session_stats.last_seen_at
       from users u
       left join lateral (
         select
           count(*)::text as songs_count,
           count(*) filter (where visibility = 'public')::text as public_songs_count,
           coalesce(sum(play_count), 0)::text as total_plays,
           coalesce(sum(view_count), 0)::text as total_views
         from songs
         where user_id = u.id
       ) song_stats on true
       left join lateral (
         select
           count(*)::text as session_count,
           count(distinct session_fingerprint)::text as device_count,
           coalesce(sum(request_count), 0)::text as request_count,
           string_agg(distinct platform, ', ') as platforms,
           min(first_seen_at) as first_seen_at,
           max(last_seen_at) as last_seen_at
         from user_sessions
         where user_id = u.id
       ) session_stats on true
       order by u.created_at desc
       limit 300`
    );

    return rows.map(mapAdminUser);
  }

  async getSongs() {
    const rows = await this.db.query<AdminSongRow>(
      `select
         s.id, s.user_id, u.display_name as creator_name, s.title, s.theme, s.style, s.mood,
         s.audio_url, s.cover_url, s.visibility, s.likes_count, s.favorites_count,
         s.view_count, s.play_count, s.comments_count, s.is_submitted_to_challenge,
         s.created_at, s.published_at, s.updated_at
       from songs s
       join users u on u.id = s.user_id
       order by s.created_at desc
       limit 300`
    );

    return rows.map(mapAdminSong);
  }

  async updateSong(id: string, dto: UpdateSongAdminDto) {
    if (!dto.visibility) {
      throw new BadRequestException("No song moderation change was provided");
    }

    const row = await this.db.one<AdminSongRow>(
      `update songs
       set visibility = $2::song_visibility,
           published_at = case
             when $2::song_visibility = 'public' then coalesce(published_at, now())
             else published_at
           end
       where id = $1
       returning
         id, user_id, (select display_name from users where id = songs.user_id) as creator_name,
         title, theme, style, mood, audio_url, cover_url, visibility, likes_count, favorites_count,
         view_count, play_count, comments_count, is_submitted_to_challenge, created_at, published_at, updated_at`,
      [id, dto.visibility]
    );

    if (!row) {
      throw new NotFoundException("Song not found");
    }

    await this.db.query(
      `insert into admin_audit_logs (actor, action, target_type, target_id, metadata)
       values ('admin', 'moderate_song', 'song', $1, $2::jsonb)`,
      [id, JSON.stringify({ visibility: dto.visibility, note: dto.moderationNote?.trim() || null })]
    );

    return mapAdminSong(row);
  }

  async getSettings() {
    return getPlatformSettings(this.db);
  }

  async updateSettings(dto: UpdatePlatformSettingsDto) {
    const settings = await updatePlatformSettings(this.db, dto);
    await this.db.query(
      `insert into admin_audit_logs (actor, action, target_type, metadata)
       values ('admin', 'update_platform_settings', 'app_settings', $1::jsonb)`,
      [JSON.stringify(dto)]
    );
    return settings;
  }

  async getWithdrawals(status?: string) {
    const params: unknown[] = [];
    const where = status ? "where rw.status = $1" : "";
    if (status) {
      params.push(parseWithdrawalStatus(status));
    }

    const rows = await this.db.query<WithdrawalRow>(
      `select
         rw.id, rw.user_id, u.display_name, rw.amount_points, rw.usdc_amount, rw.wallet_address,
         rw.status, rw.risk_note, rw.reviewed_by, rw.reviewed_at, rw.created_at, rw.updated_at
       from reward_withdrawals rw
       join users u on u.id = rw.user_id
       ${where}
       order by rw.created_at desc
       limit 200`,
      params
    );

    return rows.map(mapWithdrawal);
  }

  async reviewWithdrawal(id: string, dto: ReviewWithdrawalDto) {
    const note = dto.riskNote?.trim();
    if (!note) {
      throw new BadRequestException("Risk note is required");
    }

    return this.db.transaction(async (client) => {
      const result = await client.query<WithdrawalRow>(
        `select
           rw.id, rw.user_id, u.display_name, rw.amount_points, rw.usdc_amount, rw.wallet_address,
           rw.status, rw.risk_note, rw.reviewed_by, rw.reviewed_at, rw.created_at, rw.updated_at
         from reward_withdrawals rw
         join users u on u.id = rw.user_id
         where rw.id = $1
         for update`,
        [id]
      );
      const withdrawal = result.rows[0];

      if (!withdrawal) {
        throw new NotFoundException("Withdrawal not found");
      }

      if (withdrawal.status !== "pending_review") {
        throw new BadRequestException("Only pending withdrawals can be reviewed");
      }

      if (dto.decision === "rejected") {
        await refundWithdrawalPoints(client, withdrawal);
      }

      const updated = await client.query<WithdrawalRow>(
        `update reward_withdrawals
         set status = $2, risk_note = $3, reviewed_by = 'admin', reviewed_at = now()
         where id = $1
         returning
           id, user_id, (select display_name from users where id = reward_withdrawals.user_id) as display_name,
           amount_points, usdc_amount, wallet_address, status, risk_note, reviewed_by,
           reviewed_at, created_at, updated_at`,
        [id, dto.decision, note]
      );

      await client.query(
        `insert into admin_audit_logs (actor, action, target_type, target_id, metadata)
         values ('admin', 'review_withdrawal', 'reward_withdrawal', $1, $2::jsonb)`,
        [id, JSON.stringify({ decision: dto.decision, riskNote: note })]
      );

      return mapWithdrawal(updated.rows[0]);
    });
  }

  async getChallenges() {
    const rows = await this.db.query<ChallengeRow>(
      `select
         c.id, c.title, c.theme, c.description, c.starts_at, c.ends_at, c.min_plan,
         c.reward_points, c.is_active, count(cs.id)::text as submissions_count, c.created_at
       from challenges c
       left join challenge_submissions cs on cs.challenge_id = c.id
       group by c.id
       order by c.starts_at desc
       limit 200`
    );

    return rows.map(mapChallenge);
  }

  async createChallenge(dto: CreateChallengeDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException("Challenge end time must be after start time");
    }

    const row = await this.db.one<ChallengeRow>(
      `insert into challenges (title, theme, description, starts_at, ends_at, min_plan, reward_points, is_active)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning
         id, title, theme, description, starts_at, ends_at, min_plan, reward_points,
         is_active, '0'::text as submissions_count, created_at`,
      [
        dto.title.trim(),
        dto.theme.trim(),
        dto.description?.trim() || null,
        startsAt,
        endsAt,
        dto.minPlan,
        dto.rewardPoints,
        dto.isActive ?? true
      ]
    );

    if (!row) {
      throw new BadRequestException("Unable to create challenge");
    }

    return mapChallenge(row);
  }

  private async count(table: "users" | "songs" | "music_tasks") {
    const row = await this.db.one<CountRow>(`select count(*)::text as count from ${table}`);
    return Number(row?.count ?? 0);
  }
}

async function refundWithdrawalPoints(client: PoolClient, withdrawal: WithdrawalRow) {
  const balanceResult = await client.query<{ points_balance: number }>(
    `update users
     set points_balance = points_balance + $2
     where id = $1
     returning points_balance`,
    [withdrawal.user_id, withdrawal.amount_points]
  );

  await client.query(
    `insert into points_ledger (user_id, source, source_id, delta, balance_after, status, metadata)
     values ($1, 'reward_withdrawal_rejected', $2, $3, $4, 'available', $5::jsonb)`,
    [
      withdrawal.user_id,
      withdrawal.id,
      withdrawal.amount_points,
      balanceResult.rows[0]?.points_balance ?? withdrawal.amount_points,
      JSON.stringify({ reason: "withdrawal_rejected" })
    ]
  );
}

function parseWithdrawalStatus(status: string): WithdrawalFilterStatus {
  const allowed: WithdrawalFilterStatus[] = ["pending_review", "approved", "rejected", "paid"];
  if (!allowed.includes(status as WithdrawalFilterStatus)) {
    throw new BadRequestException("Invalid withdrawal status filter");
  }

  return status as WithdrawalFilterStatus;
}

function rowsToStatusMap(rows: StatusCountRow[]) {
  return rows.reduce<Record<string, number>>((map, row) => {
    map[row.status] = Number(row.count);
    return map;
  }, {});
}

function mapTask(row: TaskAuditRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userDisplayName: row.user_display_name,
    userEmail: row.user_email,
    title: row.title,
    status: row.status,
    isSuccessful: row.status === "succeeded" && Boolean(row.song_id),
    hasGeneratedSong: Boolean(row.song_id),
    prompt: row.prompt,
    style: row.style,
    mood: row.mood,
    mode: row.mode,
    minimaxModel: row.minimax_model,
    minimaxTraceId: row.minimax_trace_id,
    minimaxStatusCode: row.minimax_status_code,
    estimatedCostCents: row.estimated_cost_cents,
    durationMs: row.duration_ms,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    quotaRefunded: row.quota_refunded,
    songId: row.song_id,
    songTitle: row.song_title,
    songAudioUrl: row.song_audio_url,
    songVisibility: row.song_visibility,
    startedAt: row.started_at ? toIso(row.started_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : null
  };
}

function mapAdminUser(row: AdminUserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    plan: row.plan,
    riskStatus: row.risk_status,
    pointsBalance: row.points_balance,
    songsCount: Number(row.songs_count ?? 0),
    publicSongsCount: Number(row.public_songs_count ?? 0),
    totalPlays: Number(row.total_plays ?? 0),
    totalViews: Number(row.total_views ?? 0),
    sessionCount: Number(row.session_count ?? 0),
    deviceCount: Number(row.device_count ?? 0),
    requestCount: Number(row.request_count ?? 0),
    platforms: splitPlatforms(row.platforms),
    serviceMinutes: minutesBetween(row.first_seen_at, row.last_seen_at),
    firstSeenAt: row.first_seen_at ? toIso(row.first_seen_at) : null,
    lastSeenAt: row.last_seen_at ? toIso(row.last_seen_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapAdminSong(row: AdminSongRow) {
  return {
    id: row.id,
    userId: row.user_id,
    creatorName: row.creator_name,
    title: row.title,
    theme: row.theme,
    style: row.style,
    mood: row.mood,
    audioUrl: row.audio_url,
    coverUrl: row.cover_url,
    visibility: row.visibility,
    likesCount: row.likes_count,
    favoritesCount: row.favorites_count,
    viewCount: row.view_count,
    playCount: row.play_count,
    commentsCount: row.comments_count,
    isSubmittedToChallenge: row.is_submitted_to_challenge,
    createdAt: toIso(row.created_at),
    publishedAt: row.published_at ? toIso(row.published_at) : null,
    updatedAt: toIso(row.updated_at)
  };
}

function mapWithdrawal(row: WithdrawalRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userDisplayName: row.display_name,
    amountPoints: row.amount_points,
    usdcAmount: Number(row.usdc_amount),
    walletAddress: row.wallet_address,
    status: row.status,
    riskNote: row.risk_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? toIso(row.reviewed_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapChallenge(row: ChallengeRow) {
  return {
    id: row.id,
    title: row.title,
    theme: row.theme,
    description: row.description,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    minPlan: row.min_plan,
    rewardPoints: row.reward_points,
    isActive: row.is_active,
    submissionsCount: Number(row.submissions_count),
    createdAt: toIso(row.created_at)
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function splitPlatforms(value: string | null): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function minutesBetween(start: Date | string | null, end: Date | string | null): number {
  if (!start || !end) {
    return 0;
  }

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  return Math.round((endMs - startMs) / 60000);
}
