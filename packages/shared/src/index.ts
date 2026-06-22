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
  referenceAudioUrl?: string;
}

export interface MusicTask {
  id: string;
  status: TaskStatus;
  prompt: string;
  style: string;
  mood: string;
  mode: SongMode;
  errorMessage?: string | null;
  songId?: string | null;
  audioUrl?: string | null;
  coverUrl?: string | null;
  lyrics?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Song {
  id: string;
  userId: string;
  title: string;
  theme: string;
  style: string;
  mood: string;
  lyrics?: string | null;
  audioUrl: string;
  coverUrl?: string | null;
  visibility: Visibility;
  likesCount: number;
  favoritesCount: number;
  commentsCount: number;
  createdAt: string;
}

export interface FeedItem extends Song {
  creatorName: string;
  likedByMe: boolean;
  favoritedByMe: boolean;
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

export const PLAN_LIMITS: Record<Plan, { dailyFreeTrial: number; monthlyGenerations: number; canJoinRewards: boolean }> = {
  free: { dailyFreeTrial: 1, monthlyGenerations: 0, canJoinRewards: false },
  pro: { dailyFreeTrial: 0, monthlyGenerations: 100, canJoinRewards: false },
  creator: { dailyFreeTrial: 0, monthlyGenerations: 100, canJoinRewards: true }
};

export const IAP_PRODUCTS: Record<string, Plan> = {
  "com.melodyai.pro.monthly": "pro",
  "com.melodyai.creator.monthly": "creator"
};
