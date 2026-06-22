import type {
  Challenge,
  ChallengeDraft,
  AdminSong,
  AdminUser,
  MusicTaskAudit,
  OverviewData,
  Plan,
  PlatformSettings,
  PlatformSettingsDraft,
  ReviewDecision,
  RewardWithdrawal,
  SongMode,
  TaskStatus,
  WithdrawalStatus
} from "./types";

const API_BASE_URL = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? "/api");
const STATIC_ADMIN_API_KEY = "";
const ADMIN_KEY_STORAGE = "green-sonic-admin-key";
let adminApiKey = readInitialAdminKey();

export const apiConfig = {
  baseUrl: API_BASE_URL,
  get hasAdminKey() {
    return hasAdminAccessKey();
  }
};

export function getAdminAccessKey(): string {
  return adminApiKey;
}

export function hasAdminAccessKey(): boolean {
  return getAdminAccessKey().trim().length > 0;
}

export function setAdminAccessKey(key: string) {
  adminApiKey = key.trim();
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(ADMIN_KEY_STORAGE, adminApiKey);
  }
}

export function clearAdminAccessKey() {
  adminApiKey = STATIC_ADMIN_API_KEY;
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  }
}

export const adminApi = {
  async getOverview(): Promise<OverviewData> {
    const payload = await request<unknown>("/admin/overview");
    return normalizeOverview(payload);
  },

  async getMusicTasks(): Promise<MusicTaskAudit[]> {
    const payload = await request<unknown>("/admin/music-tasks");
    return extractItems(payload).map(normalizeMusicTask);
  },

  async getUsers(): Promise<AdminUser[]> {
    const payload = await request<unknown>("/admin/users");
    return extractItems(payload).map(normalizeAdminUser);
  },

  async getSongs(): Promise<AdminSong[]> {
    const payload = await request<unknown>("/admin/songs");
    return extractItems(payload).map(normalizeAdminSong);
  },

  async updateSongVisibility(id: string, visibility: AdminSong["visibility"], moderationNote: string): Promise<AdminSong> {
    const payload = await request<unknown>(`/admin/songs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        visibility,
        moderationNote
      })
    });

    return normalizeAdminSong(payload);
  },

  async getSettings(): Promise<PlatformSettings> {
    const payload = await request<unknown>("/admin/settings");
    return normalizePlatformSettings(payload);
  },

  async updateSettings(draft: PlatformSettingsDraft): Promise<PlatformSettings> {
    const payload = await request<unknown>("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(draft)
    });

    return normalizePlatformSettings(payload);
  },

  async getWithdrawals(): Promise<RewardWithdrawal[]> {
    const payload = await request<unknown>("/admin/withdrawals?status=pending_review");
    return extractItems(payload).map(normalizeWithdrawal);
  },

  async reviewWithdrawal(id: string, decision: ReviewDecision, riskNote: string): Promise<RewardWithdrawal> {
    const payload = await request<unknown>(`/admin/withdrawals/${encodeURIComponent(id)}/review`, {
      method: "POST",
      body: JSON.stringify({
        decision,
        riskNote
      })
    });

    return normalizeWithdrawal(payload);
  },

  async getChallenges(): Promise<Challenge[]> {
    const payload = await request<unknown>("/admin/challenges");
    return extractItems(payload).map(normalizeChallenge);
  },

  async createChallenge(draft: ChallengeDraft): Promise<Challenge> {
    const payload = await request<unknown>("/admin/challenges", {
      method: "POST",
      body: JSON.stringify({
        title: draft.title,
        theme: draft.theme,
        description: draft.description,
        startsAt: toIsoDateTime(draft.startsAt),
        endsAt: toIsoDateTime(draft.endsAt),
        minPlan: draft.minPlan,
        rewardPoints: draft.rewardPoints
      })
    });

    return normalizeChallenge(payload);
  }
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": getAdminAccessKey(),
      ...init.headers
    }
  });

  const text = await response.text();
  const payload = parseJson(text);

  if (!response.ok) {
    throw new Error(readApiError(payload) ?? `Admin request failed with ${response.status}`);
  }

  return payload as T;
}

function normalizeOverview(payload: unknown): OverviewData {
  const record = asRecord(payload);
  const taskStatusCounts = readStatusCounts<TaskStatus>(record, "tasks", ["queued", "generating", "succeeded", "failed"]);
  const withdrawalStatusCounts = readStatusCounts<WithdrawalStatus>(record, "withdrawals", [
    "pending_review",
    "approved",
    "rejected",
    "paid"
  ]);

  return {
    usersCount: readNumber(record, ["users.total", "users.count", "usersCount", "totalUsers", "users"], 0),
    todayUsersCount: readNumber(record, ["todayUsersCount", "users.today", "todayUsers"], 0),
    activeUsersToday: readNumber(record, ["activeUsersToday", "users.activeToday"], 0),
    activeUsers7d: readNumber(record, ["activeUsers7d", "users.active7d"], 0),
    songsCount: readNumber(record, ["songs.total", "songs.count", "songsCount", "totalSongs", "songs"], 0),
    tasksCount: readNumber(record, ["tasks.total", "tasks.count", "tasksCount", "totalTasks", "tasks"], sumCounts(taskStatusCounts)),
    pendingWithdrawalsCount: readNumber(
      record,
      [
        "withdrawals.pendingReview",
        "withdrawals.pending_review",
        "pendingWithdrawals",
        "pendingWithdrawalsCount",
        "pendingReviewWithdrawals"
      ],
      withdrawalStatusCounts.pending_review ?? 0
    ),
    totalPointsBalance: readNumber(record, ["totalPointsBalance", "points.balance", "points.totalBalance"], 0),
    lifetimePointsIssued: readNumber(record, ["lifetimePointsIssued", "points.lifetimeIssued"], 0),
    reservedPoints: readNumber(record, ["reservedPoints", "points.reserved"], 0),
    totalUsdcRequested: readNumber(record, ["totalUsdcRequested", "withdrawals.totalUsdcRequested"], 0),
    totalPlays: readNumber(record, ["totalPlays", "songs.totalPlays"], 0),
    totalViews: readNumber(record, ["totalViews", "songs.totalViews"], 0),
    totalComments: readNumber(record, ["totalComments", "songs.totalComments"], 0),
    minimaxCostCents: readNumber(
      record,
      ["minimax.costCents", "minimax.totalCostCents", "minimaxCostCents", "totalMiniMaxCostCents"],
      0
    ),
    minimaxFailedCostCents: readNumber(record, ["minimax.failedCostCents", "minimaxFailedCostCents"], 0),
    taskStatusCounts,
    withdrawalStatusCounts,
    activeChallengesCount: readNumber(record, ["challenges.active", "activeChallenges", "activeChallengesCount"], 0),
    settings: normalizePlatformSettings(record.settings)
  };
}

function normalizePlatformSettings(raw: unknown): PlatformSettings {
  const record = asRecord(raw);
  return {
    pointsPerUsdc: readNumber(record, ["pointsPerUsdc", "points_per_usdc"], 10),
    minWithdrawalPoints: readNumber(record, ["minWithdrawalPoints", "min_withdrawal_points"], 10),
    publishRewardPoints: readNumber(record, ["publishRewardPoints", "publish_reward_points"], 25),
    updatedAt: readOptionalString(record, ["updatedAt", "updated_at"])
  };
}

function normalizeAdminUser(raw: unknown): AdminUser {
  const record = asRecord(raw);
  const platformsRaw = readValue(record, ["platforms"]);
  return {
    id: readString(record, ["id"], "unknown-user"),
    email: readOptionalString(record, ["email"]),
    displayName: readString(record, ["displayName", "display_name"], "Creator"),
    avatarUrl: readOptionalString(record, ["avatarUrl", "avatar_url"]),
    plan: readEnum<Plan>(record, ["plan"], ["free", "pro", "creator"], "free"),
    riskStatus: readString(record, ["riskStatus", "risk_status"], "clear"),
    pointsBalance: readNumber(record, ["pointsBalance", "points_balance"], 0),
    songsCount: readNumber(record, ["songsCount", "songs_count"], 0),
    publicSongsCount: readNumber(record, ["publicSongsCount", "public_songs_count"], 0),
    totalPlays: readNumber(record, ["totalPlays", "total_plays"], 0),
    totalViews: readNumber(record, ["totalViews", "total_views"], 0),
    sessionCount: readNumber(record, ["sessionCount", "session_count"], 0),
    deviceCount: readNumber(record, ["deviceCount", "device_count"], 0),
    requestCount: readNumber(record, ["requestCount", "request_count"], 0),
    platforms: Array.isArray(platformsRaw) ? platformsRaw.filter((item): item is string => typeof item === "string") : [],
    serviceMinutes: readNumber(record, ["serviceMinutes", "service_minutes"], 0),
    firstSeenAt: readOptionalString(record, ["firstSeenAt", "first_seen_at"]),
    lastSeenAt: readOptionalString(record, ["lastSeenAt", "last_seen_at"]),
    createdAt: readString(record, ["createdAt", "created_at"], new Date().toISOString()),
    updatedAt: readOptionalString(record, ["updatedAt", "updated_at"])
  };
}

function normalizeAdminSong(raw: unknown): AdminSong {
  const record = asRecord(raw);
  return {
    id: readString(record, ["id"], "unknown-song"),
    userId: readString(record, ["userId", "user_id"], "unknown-user"),
    creatorName: readString(record, ["creatorName", "creator_name"], "Creator"),
    title: readString(record, ["title"], "Untitled"),
    theme: readString(record, ["theme"], ""),
    style: readString(record, ["style"], "Unknown"),
    mood: readString(record, ["mood"], "Unknown"),
    audioUrl: readString(record, ["audioUrl", "audio_url"], ""),
    coverUrl: readOptionalString(record, ["coverUrl", "cover_url"]),
    visibility: readEnum(record, ["visibility"], ["private", "public"], "private"),
    likesCount: readNumber(record, ["likesCount", "likes_count"], 0),
    favoritesCount: readNumber(record, ["favoritesCount", "favorites_count"], 0),
    viewCount: readNumber(record, ["viewCount", "view_count"], 0),
    playCount: readNumber(record, ["playCount", "play_count"], 0),
    commentsCount: readNumber(record, ["commentsCount", "comments_count"], 0),
    isSubmittedToChallenge: readBoolean(record, ["isSubmittedToChallenge", "is_submitted_to_challenge"], false),
    createdAt: readString(record, ["createdAt", "created_at"], new Date().toISOString()),
    publishedAt: readOptionalString(record, ["publishedAt", "published_at"]),
    updatedAt: readOptionalString(record, ["updatedAt", "updated_at"])
  };
}

function normalizeMusicTask(raw: unknown): MusicTaskAudit {
  const record = asRecord(raw);

  return {
    id: readString(record, ["id"], "unknown-task"),
    userId: readOptionalString(record, ["userId", "user_id"]),
    userDisplayName: readOptionalString(record, ["userDisplayName", "user_display_name", "displayName", "display_name"]),
    userEmail: readOptionalString(record, ["userEmail", "user_email", "email"]),
    title: readOptionalString(record, ["title"]),
    status: readEnum(record, ["status"], ["queued", "generating", "succeeded", "failed"], "queued"),
    isSuccessful: readBoolean(record, ["isSuccessful", "is_successful"], false),
    hasGeneratedSong: readBoolean(record, ["hasGeneratedSong", "has_generated_song"], false),
    prompt: readString(record, ["prompt", "theme"], "Untitled prompt"),
    style: readString(record, ["style"], "Unknown"),
    mood: readString(record, ["mood"], "Unknown"),
    mode: readEnum<SongMode>(record, ["mode"], ["instrumental", "vocal"], "instrumental"),
    minimaxModel: readOptionalString(record, ["minimaxModel", "minimax_model", "model"]),
    minimaxTraceId: readOptionalString(record, ["minimaxTraceId", "minimax_trace_id", "traceId"]),
    minimaxStatusCode: readOptionalNumber(record, ["minimaxStatusCode", "minimax_status_code", "statusCode"]),
    estimatedCostCents: readNumber(record, ["estimatedCostCents", "estimated_cost_cents", "costCents"], 0),
    durationMs: readOptionalNumber(record, ["durationMs", "duration_ms"]),
    errorCode: readOptionalString(record, ["errorCode", "error_code"]),
    errorMessage: readOptionalString(record, ["errorMessage", "error_message"]),
    quotaRefunded: readOptionalBoolean(record, ["quotaRefunded", "quota_refunded"]),
    songId: readOptionalString(record, ["songId", "song_id"]),
    songTitle: readOptionalString(record, ["songTitle", "song_title"]),
    songAudioUrl: readOptionalString(record, ["songAudioUrl", "song_audio_url", "audioUrl", "audio_url"]),
    songVisibility: readEnum<"private" | "public">(record, ["songVisibility", "song_visibility"], ["private", "public"], "private"),
    startedAt: readOptionalString(record, ["startedAt", "started_at"]),
    createdAt: readString(record, ["createdAt", "created_at"], new Date().toISOString()),
    updatedAt: readOptionalString(record, ["updatedAt", "updated_at"]),
    completedAt: readOptionalString(record, ["completedAt", "completed_at"])
  };
}

function normalizeWithdrawal(raw: unknown): RewardWithdrawal {
  const record = asRecord(raw);

  return {
    id: readString(record, ["id"], "unknown-withdrawal"),
    userId: readOptionalString(record, ["userId", "user_id"]),
    userDisplayName: readOptionalString(record, ["userDisplayName", "displayName", "display_name"]),
    amountPoints: readNumber(record, ["amountPoints", "amount_points"], 0),
    usdcAmount: readNumber(record, ["usdcAmount", "usdc_amount"], 0),
    walletAddress: readString(record, ["walletAddress", "wallet_address"], ""),
    status: readEnum<WithdrawalStatus>(record, ["status"], ["pending_review", "approved", "rejected", "paid"], "pending_review"),
    riskNote: readOptionalString(record, ["riskNote", "risk_note"]),
    reviewedBy: readOptionalString(record, ["reviewedBy", "reviewed_by"]),
    reviewedAt: readOptionalString(record, ["reviewedAt", "reviewed_at"]),
    createdAt: readString(record, ["createdAt", "created_at"], new Date().toISOString()),
    updatedAt: readOptionalString(record, ["updatedAt", "updated_at"])
  };
}

function normalizeChallenge(raw: unknown): Challenge {
  const record = asRecord(raw);

  return {
    id: readString(record, ["id"], "unknown-challenge"),
    title: readString(record, ["title"], "Daily Theme"),
    theme: readString(record, ["theme"], "Untitled theme"),
    description: readOptionalString(record, ["description"]),
    startsAt: readString(record, ["startsAt", "starts_at"], new Date().toISOString()),
    endsAt: readString(record, ["endsAt", "ends_at"], new Date().toISOString()),
    minPlan: readEnum<Plan>(record, ["minPlan", "min_plan"], ["free", "pro", "creator"], "creator"),
    rewardPoints: readNumber(record, ["rewardPoints", "reward_points"], 1000),
    isActive: readBoolean(record, ["isActive", "is_active"], true),
    submissionsCount: readOptionalNumber(record, ["submissionsCount", "submissions_count"]),
    createdAt: readOptionalString(record, ["createdAt", "created_at"])
  };
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  const candidates = [record.items, record.data, record.results, record.rows];
  const list = candidates.find(Array.isArray);
  return list ?? [];
}

function readStatusCounts<T extends string>(record: Record<string, unknown>, group: string, statuses: T[]): Partial<Record<T, number>> {
  return statuses.reduce<Partial<Record<T, number>>>((counts, status) => {
    const value = readOptionalNumber(record, [`${group}.${status}`, `${group}.${toCamelStatus(status)}`, `${status}Count`]);
    if (value !== undefined) {
      counts[status] = value;
    }
    return counts;
  }, {});
}

function readApiError(payload: unknown): string | undefined {
  const record = asRecord(payload);
  return readOptionalString(record, ["message", "error", "detail"]);
}

function parseJson(text: string): unknown {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function readEnum<T extends string>(record: Record<string, unknown>, keys: string[], allowed: readonly T[], fallback: T): T {
  const value = readOptionalString(record, keys);
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

function readString(record: Record<string, unknown>, keys: string[], fallback: string): string {
  return readOptionalString(record, keys) ?? fallback;
}

function readOptionalString(record: Record<string, unknown>, keys: string[]): string | undefined {
  const value = readValue(record, keys);
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(record: Record<string, unknown>, keys: string[], fallback: number): number {
  return readOptionalNumber(record, keys) ?? fallback;
}

function readOptionalNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  const value = readValue(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readBoolean(record: Record<string, unknown>, keys: string[], fallback: boolean): boolean {
  return readOptionalBoolean(record, keys) ?? fallback;
}

function readOptionalBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  const value = readValue(record, keys);
  return typeof value === "boolean" ? value : undefined;
}

function readValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = getPath(record, key);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function getPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, source);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function readInitialAdminKey(): string {
  if (typeof window === "undefined") {
    return STATIC_ADMIN_API_KEY;
  }

  return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) || STATIC_ADMIN_API_KEY;
}

function toCamelStatus(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function sumCounts(counts: Partial<Record<string, number>>): number {
  return Object.values(counts).reduce<number>((total, value) => total + (value ?? 0), 0);
}

function toIsoDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
