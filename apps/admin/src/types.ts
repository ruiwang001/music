export type AdminView = "overview" | "users" | "songs" | "tasks" | "withdrawals" | "challenges" | "settings";

export type TaskStatus = "queued" | "generating" | "succeeded" | "failed";
export type SongMode = "instrumental" | "vocal";
export type WithdrawalStatus = "pending_review" | "approved" | "rejected" | "paid";
export type ReviewDecision = "approved" | "rejected";
export type Plan = "free" | "pro" | "creator";

export interface OverviewMetric {
  label: string;
  value: number;
  detail?: string;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
}

export interface OverviewData {
  usersCount: number;
  todayUsersCount: number;
  activeUsersToday: number;
  activeUsers7d: number;
  songsCount: number;
  tasksCount: number;
  pendingWithdrawalsCount: number;
  totalPointsBalance: number;
  lifetimePointsIssued: number;
  reservedPoints: number;
  totalUsdcRequested: number;
  totalPlays: number;
  totalViews: number;
  totalComments: number;
  minimaxCostCents: number;
  minimaxFailedCostCents: number;
  taskStatusCounts: Partial<Record<TaskStatus, number>>;
  withdrawalStatusCounts: Partial<Record<WithdrawalStatus, number>>;
  activeChallengesCount: number;
  settings: PlatformSettings;
}

export interface PlatformSettings {
  pointsPerUsdc: number;
  minWithdrawalPoints: number;
  publishRewardPoints: number;
  updatedAt?: string | null;
}

export interface PlatformSettingsDraft {
  pointsPerUsdc: number;
  minWithdrawalPoints: number;
  publishRewardPoints: number;
}

export interface MusicTaskAudit {
  id: string;
  userId?: string;
  userDisplayName?: string | null;
  userEmail?: string | null;
  title?: string;
  status: TaskStatus;
  isSuccessful: boolean;
  hasGeneratedSong: boolean;
  prompt: string;
  style: string;
  mood: string;
  mode: SongMode;
  minimaxModel?: string;
  minimaxTraceId?: string;
  minimaxStatusCode?: number;
  estimatedCostCents: number;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  quotaRefunded?: boolean;
  songId?: string | null;
  songTitle?: string | null;
  songAudioUrl?: string | null;
  songVisibility?: "private" | "public" | null;
  startedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface RewardWithdrawal {
  id: string;
  userId?: string;
  userDisplayName?: string;
  amountPoints: number;
  usdcAmount: number;
  walletAddress: string;
  status: WithdrawalStatus;
  riskNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminUser {
  id: string;
  email?: string | null;
  displayName: string;
  avatarUrl?: string | null;
  plan: Plan;
  riskStatus: string;
  pointsBalance: number;
  songsCount: number;
  publicSongsCount: number;
  totalPlays: number;
  totalViews: number;
  sessionCount: number;
  deviceCount: number;
  requestCount: number;
  platforms: string[];
  serviceMinutes: number;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminSong {
  id: string;
  userId: string;
  creatorName: string;
  title: string;
  theme: string;
  style: string;
  mood: string;
  audioUrl: string;
  coverUrl?: string | null;
  visibility: "private" | "public";
  likesCount: number;
  favoritesCount: number;
  viewCount: number;
  playCount: number;
  commentsCount: number;
  isSubmittedToChallenge: boolean;
  createdAt: string;
  publishedAt?: string | null;
  updatedAt?: string;
}

export interface Challenge {
  id: string;
  title: string;
  theme: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  minPlan: Plan;
  rewardPoints: number;
  isActive: boolean;
  submissionsCount?: number;
  createdAt?: string;
}

export interface ChallengeDraft {
  title: string;
  theme: string;
  description: string;
  startsAt: string;
  endsAt: string;
  minPlan: Plan;
  rewardPoints: number;
}

export interface AdminSnapshot {
  overview: OverviewData;
  users: AdminUser[];
  songs: AdminSong[];
  tasks: MusicTaskAudit[];
  withdrawals: RewardWithdrawal[];
  challenges: Challenge[];
  settings: PlatformSettings;
}

export interface RequestState {
  loading: boolean;
  error?: string;
  message?: string;
}
