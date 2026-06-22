export type Plan = "free" | "pro" | "creator";
export type SongMode = "instrumental" | "vocal";

export const PLAN_LIMITS: Record<Plan, { dailyFreeTrial: number; monthlyGenerations: number; canJoinRewards: boolean }> = {
  free: { dailyFreeTrial: 1, monthlyGenerations: 0, canJoinRewards: false },
  pro: { dailyFreeTrial: 0, monthlyGenerations: 100, canJoinRewards: false },
  creator: { dailyFreeTrial: 0, monthlyGenerations: 100, canJoinRewards: true }
};

export const IAP_PRODUCTS: Record<string, Plan> = {
  "com.melodyai.pro.monthly": "pro",
  "com.melodyai.creator.monthly": "creator"
};
