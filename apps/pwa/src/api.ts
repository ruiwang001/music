export type Plan = "free" | "pro" | "creator";
export type SongMode = "instrumental" | "vocal";
export type TaskStatus = "queued" | "generating" | "succeeded" | "failed";
export type Visibility = "private" | "public";
export type WithdrawalStatus = "pending_review" | "approved" | "rejected" | "paid";

export interface GenerateMusicRequest {
  title?: string;
  theme: string;
  style: string;
  mood: string;
  lyrics?: string;
  mode: SongMode;
  lyricsOptimizer?: boolean;
}

export interface MusicTask {
  id: string;
  status: TaskStatus;
  title?: string | null;
  prompt: string;
  theme?: string;
  style: string;
  mood: string;
  mode: SongMode;
  errorCode?: string | null;
  errorMessage?: string | null;
  quotaRefunded?: boolean;
  songId?: string | null;
  audioUrl?: string | null;
  coverUrl?: string | null;
  lyrics?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MvTask {
  id: string;
  userId: string;
  songId: string;
  songTitle?: string | null;
  songCoverUrl?: string | null;
  status: TaskStatus;
  prompt: string;
  imageCount: number;
  imageNames: string[];
  videoUrl?: string | null;
  minimaxTaskId?: string | null;
  minimaxFileId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  estimatedCostCents?: number;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMvTaskRequest {
  songId: string;
  prompt?: string;
  imageCount?: number;
  imageNames?: string[];
}

export interface CreateMvTaskResponse {
  task: MvTask;
}

export interface Song {
  id: string;
  userId: string;
  taskId?: string | null;
  title: string;
  theme: string;
  style: string;
  mood: string;
  lyrics?: string | null;
  audioUrl: string;
  coverUrl?: string | null;
  mode?: SongMode;
  visibility: Visibility;
  likesCount: number;
  favoritesCount: number;
  viewCount: number;
  playCount: number;
  commentsCount: number;
  createdAt: string;
  publishedAt?: string | null;
}

export interface FeedItem extends Song {
  creatorName: string;
  likedByMe: boolean;
  favoritedByMe: boolean;
}

export interface Comment {
  id: string;
  songId?: string;
  userName: string;
  body: string;
  likesCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface CreateCommentResponse {
  comment: Comment;
  commentsCount?: number;
}

export interface CreatorProfile {
  creator: {
    id: string;
    displayName: string;
    email?: string | null;
    avatarUrl?: string | null;
    followersCount: number;
    followingCount: number;
    songsCount: number;
    totalPlayCount: number;
    totalViewCount: number;
    followedByMe: boolean;
  };
  songs: FeedItem[];
}

export interface ChallengeLeaderboardEntry {
  rank: number;
  songId: string;
  title: string;
  creatorName: string;
  score: number;
  likesCount: number;
}

export interface DailyChallenge {
  id: string;
  title: string;
  theme: string;
  mood: string;
  styleHint: string;
  minPlan?: Plan;
  rewardPoints: number;
  endsAt: string;
  submissionCount: number;
  leaderboard: ChallengeLeaderboardEntry[];
}

export interface PointLedgerEntry {
  id: string;
  source: string;
  delta: number;
  balanceAfter: number;
  status: "available" | "pending" | "reserved" | "void";
  createdAt: string;
}

export interface RewardWithdrawal {
  id: string;
  amountPoints: number;
  usdcAmount: number;
  walletAddress: string;
  status: WithdrawalStatus;
  riskNote?: string | null;
  createdAt: string;
}

export interface RewardHistory {
  balance: number;
  lifetimeEarned: number;
  settings?: {
    pointsPerUsdc: number;
    minWithdrawalPoints: number;
    publishRewardPoints: number;
    updatedAt?: string | null;
  };
  ledger: PointLedgerEntry[];
  withdrawals: RewardWithdrawal[];
}

export interface AuthUser {
  id: string;
  email?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  plan: Plan;
  planExpiresAt?: string | null;
  riskStatus: string;
  pointsBalance: number;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface ApiSession {
  userId: string;
  token: string;
  email: string | null;
  displayName: string;
  plan: Plan;
}

export interface GenerateMusicResponse {
  task: MusicTask;
  song?: Song | null;
  quotaRefunded?: boolean;
}

export interface PublishSongResponse {
  song: Song;
  awardedPoints: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const SESSION_KEY = "green-sonic:pwa-session";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const API_BASE_URL = resolveRuntimeBaseUrl(normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL ?? "/api"));
const REQUEST_TIMEOUT_MS = 25000;
const GENERATION_TASK_TIMEOUT_MS = 330000;

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
  timeoutMessage?: string;
};

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function loadSession(): ApiSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ApiSession>;
    if (typeof parsed.userId !== "string" || typeof parsed.token !== "string") {
      return null;
    }
    return {
      userId: parsed.userId,
      token: parsed.token,
      email: typeof parsed.email === "string" ? parsed.email : null,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : "创作者",
      plan: isPlan(parsed.plan) ? parsed.plan : "free"
    };
  } catch {
    return null;
  }
}

export function saveSession(auth: AuthSession): ApiSession {
  const session: ApiSession = {
    userId: auth.user.id,
    token: auth.token,
    email: auth.user.email ?? null,
    displayName: auth.user.displayName,
    plan: auth.user.plan
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function createGuestSession(): Promise<AuthSession> {
  return request<AuthSession>("/auth/guest", {
    method: "POST"
  });
}

export async function createTestSession(): Promise<AuthSession> {
  return request<AuthSession>("/auth/test-account", {
    method: "POST"
  });
}

export async function getMe(): Promise<AuthSession> {
  return request<AuthSession>("/me");
}

export async function generateMusic(payload: GenerateMusicRequest): Promise<GenerateMusicResponse> {
  const response = await request<MusicTask | GenerateMusicResponse>("/music/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return "task" in response ? response : { task: response };
}

export function getMusicTask(taskId: string): Promise<MusicTask> {
  return request<MusicTask>(`/music/task/${encodeURIComponent(taskId)}`, {
    timeoutMs: GENERATION_TASK_TIMEOUT_MS,
    timeoutMessage: "AI 音乐生成时间较长，任务仍在处理中；请保持页面打开，或稍后回到作品栏查看。"
  });
}

export function getMyMusicTasks(): Promise<MusicTask[]> {
  return request<MusicTask[]>("/music/tasks");
}

export async function createMvTask(payload: CreateMvTaskRequest): Promise<CreateMvTaskResponse> {
  const response = await request<MvTask | CreateMvTaskResponse>("/music/mv/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return "task" in response ? response : { task: response };
}

export function getMvTask(taskId: string): Promise<MvTask> {
  return request<MvTask>(`/music/mv/task/${encodeURIComponent(taskId)}`);
}

export function getMyMvTasks(): Promise<MvTask[]> {
  return request<MvTask[]>("/music/mv/tasks");
}

export function getMySongs(): Promise<Song[]> {
  return request<Song[]>("/music/my-songs");
}

export function getSong(songId: string): Promise<Song> {
  return request<Song>(`/music/song/${encodeURIComponent(songId)}`);
}

export async function publishSong(songId: string): Promise<PublishSongResponse> {
  const response = await request<Song | PublishSongResponse>("/music/publish", {
    method: "POST",
    body: JSON.stringify({ songId })
  });
  return "song" in response ? response : { song: response, awardedPoints: 0 };
}

export function trackSongView(songId: string): Promise<Song> {
  return request<Song>(`/music/song/${encodeURIComponent(songId)}/view`, {
    method: "POST"
  });
}

export function trackSongPlay(songId: string): Promise<Song> {
  return request<Song>(`/music/song/${encodeURIComponent(songId)}/play`, {
    method: "POST"
  });
}

export function getFeed(): Promise<FeedItem[]> {
  return request<FeedItem[]>("/feed");
}

export function toggleLike(songId: string, liked: boolean): Promise<FeedItem> {
  return request<FeedItem>("/like", {
    method: "POST",
    body: JSON.stringify({ songId, liked })
  });
}

export function toggleFavorite(songId: string, favorited: boolean): Promise<FeedItem> {
  return request<FeedItem>("/favorite", {
    method: "POST",
    body: JSON.stringify({ songId, favorited })
  });
}

export async function getSongComments(songId: string): Promise<Comment[]> {
  const response = await request<Comment[] | { comments: unknown[] }>(`/songs/${encodeURIComponent(songId)}/comments`);
  const comments = Array.isArray(response) ? response : response.comments;
  return comments.map(normalizeComment);
}

export async function createComment(songId: string, body: string): Promise<CreateCommentResponse> {
  const response = await request<Comment | { comment: unknown; commentsCount?: unknown }>("/comment", {
    method: "POST",
    body: JSON.stringify({ songId, body })
  });
  return {
    comment: normalizeComment("comment" in response ? response.comment : response),
    commentsCount: "commentsCount" in response && typeof response.commentsCount === "number" ? response.commentsCount : undefined
  };
}

export async function toggleCommentLike(commentId: string, liked: boolean): Promise<Comment> {
  const response = await request<Comment | { comment: unknown }>(`/comment/${encodeURIComponent(commentId)}/like`, {
    method: "POST",
    body: JSON.stringify({ liked })
  });
  return normalizeComment("comment" in response ? response.comment : response);
}

export function getCreatorProfile(creatorId: string): Promise<CreatorProfile> {
  return request<CreatorProfile>(`/creators/${encodeURIComponent(creatorId)}`);
}

export function toggleFollow(creatorId: string, following: boolean): Promise<CreatorProfile> {
  return request<CreatorProfile>("/follow", {
    method: "POST",
    body: JSON.stringify({ creatorId, following })
  });
}

export function getDailyChallenge(): Promise<DailyChallenge> {
  return request<DailyChallenge>("/challenges/daily");
}

export function submitChallenge(challengeId: string, songId: string): Promise<DailyChallenge> {
  return request<DailyChallenge>(`/challenges/${encodeURIComponent(challengeId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ songId })
  });
}

export function getRewardHistory(): Promise<RewardHistory> {
  return request<RewardHistory>("/reward/history");
}

export function claimReward(payload: { walletAddress: string; amountPoints: number }): Promise<RewardWithdrawal> {
  return request<RewardWithdrawal>("/reward/claim", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, timeoutMessage, ...fetchInit } = init;
  const session = loadSession();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(fetchInit.headers as Record<string, string> | undefined)
  };
  if (session?.token && !headers.Authorization) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  if (fetchInit.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetch(joinUrl(path), {
      ...fetchInit,
      headers,
      signal: fetchInit.signal ?? controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new ApiError(0, timeoutMessage ?? "请求等待时间较长，请稍后刷新作品栏或重新尝试。", error);
    }
    throw new ApiError(0, "网络连接失败，请检查线上服务或稍后重试。", error);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseResponse(response);
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message: unknown }).message)
        : statusMessage(response.status);
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function joinUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (shouldUseSameOriginGateway()) {
    const pathUrl = new URL(normalizedPath, "https://green-sonic.local");
    const params = new URLSearchParams(pathUrl.search);
    params.set("path", pathUrl.pathname);
    const query = params.toString();
    return query ? `${API_BASE_URL}?${query}` : API_BASE_URL;
  }

  if (API_BASE_URL.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${API_BASE_URL}${normalizedPath.slice(4)}`;
  }
  return `${API_BASE_URL}${normalizedPath}`;
}

function shouldUseSameOriginGateway(): boolean {
  if (API_BASE_URL !== "/api" || typeof window === "undefined") {
    return false;
  }

  return !LOCAL_HOSTS.has(window.location.hostname);
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveRuntimeBaseUrl(value: string): string {
  if (typeof window === "undefined" || LOCAL_HOSTS.has(window.location.hostname)) {
    return value;
  }

  try {
    const configured = new URL(value, window.location.origin);
    if (LOCAL_HOSTS.has(configured.hostname)) {
      return "/api";
    }
  } catch {
    return value || "/api";
  }

  return value;
}

function statusMessage(status: number): string {
  if (status === 404) {
    return "服务入口暂时不可用，请刷新页面后重试。";
  }
  if (status >= 500) {
    return "服务器暂时不可用，请稍后再试。";
  }
  if (status === 401 || status === 403) {
    return "当前账号没有权限执行这个操作。";
  }
  return `请求失败，状态码 ${status}。`;
}

function normalizeComment(raw: unknown): Comment {
  const record = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const user = typeof record.user === "object" && record.user !== null ? (record.user as Record<string, unknown>) : {};
  return {
    id: String(record.id ?? `comment-${Date.now()}`),
    songId: typeof record.songId === "string" ? record.songId : undefined,
    userName: String(record.userName ?? user.displayName ?? "创作者"),
    body: String(record.body ?? ""),
    likesCount: Number(record.likesCount ?? 0),
    likedByMe: Boolean(record.likedByMe ?? false),
    createdAt: String(record.createdAt ?? new Date().toISOString())
  };
}

function isPlan(value: unknown): value is Plan {
  return value === "free" || value === "pro" || value === "creator";
}
