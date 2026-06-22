import type { GenerateMusicRequest, RewardHistory } from "./api";
import type { Tab } from "./types";

export const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "gallery", label: "广场", icon: "▣" },
  { id: "search", label: "发现", icon: "⌕" },
  { id: "home", label: "创作", icon: "♫" },
  { id: "challenge", label: "挑战", icon: "▥" },
  { id: "profile", label: "我的", icon: "●" }
];

export const styleOptions = ["Art Pop", "Indie Folk", "Lo-fi R&B", "Ambient", "Future Funk", "Neo Soul"];
export const moodOptions = ["舒服", "希望", "沉静", "年轻", "浪漫", "自由"];

export const starterPrompts: GenerateMusicRequest[] = [
  {
    title: "雨后展厅",
    theme: "雨后植物园重新亮起来，像一段温柔但有生命力的 Art Pop。",
    style: "Art Pop",
    mood: "希望",
    lyrics: "叶面收住最后一滴雨 / 我把今天重新唱起",
    mode: "vocal",
    lyricsOptimizer: true
  },
  {
    title: "午夜花园",
    theme: "深夜城市里，一个人走过安静的绿色街区，想要重新开始。",
    style: "Lo-fi R&B",
    mood: "沉静",
    lyrics: "",
    mode: "instrumental",
    lyricsOptimizer: true
  },
  {
    title: "森林来信",
    theme: "写给朋友的一封森林来信，温暖、自然、有一点民谣感。",
    style: "Indie Folk",
    mood: "舒服",
    lyrics: "我把风装进信封 / 寄给还在路上的你",
    mode: "vocal",
    lyricsOptimizer: true
  }
];

export const initialForm: GenerateMusicRequest = {
  title: "",
  theme: "",
  style: "Art Pop",
  mood: "舒服",
  lyrics: "",
  mode: "vocal",
  lyricsOptimizer: true
};

export const launchableTabs: Tab[] = ["gallery", "search", "home", "challenge", "profile", "rewards"];

export function initialTabFromUrl(): Tab {
  if (typeof window === "undefined") {
    return "home";
  }
  const tab = new URLSearchParams(window.location.search).get("tab");
  return launchableTabs.includes(tab as Tab) ? (tab as Tab) : "home";
}

export const emptyRewards: RewardHistory = {
  balance: 0,
  lifetimeEarned: 0,
  settings: {
    pointsPerUsdc: 10,
    minWithdrawalPoints: 10,
    publishRewardPoints: 25,
    updatedAt: null
  },
  ledger: [],
  withdrawals: []
};
