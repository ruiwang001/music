export type Tab = "gallery" | "search" | "home" | "challenge" | "profile" | "generating" | "detail" | "rewards";

export type BusyKey =
  | "bootstrap"
  | "generate"
  | "library"
  | "feed"
  | "challenge"
  | "rewards"
  | "publish"
  | "comment"
  | "commentLike"
  | "follow"
  | "promotion"
  | "claim"
  | "withdraw"
  | "submitChallenge"
  | "mv"
  | null;

export interface PendingMvDraft {
  enabled: boolean;
  prompt: string;
  imageCount: number;
  imageNames: string[];
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}
