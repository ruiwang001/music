import type { Comment, FeedItem, Song } from "../api";

export type SettlementStatus = "pending" | "available" | "reviewing" | "paid";

export interface CreatorStats {
  monthImpressions: number;
  monthPlays: number;
  engagementCount: number;
  creatorPoints: number;
  estimatedUsdcRange: string;
  settlementStatus: SettlementStatus;
}

export interface CreatorFund {
  poolUsdc: number;
  totalPlatformPoints: number;
  myPoints: number;
  estimatedShareRange: string;
  settlementNote: string;
}

export interface GrowthPoint {
  label: string;
  impressions: number;
  plays: number;
  points: number;
}

export interface PromotionPackage {
  id: string;
  name: string;
  priceUsdc: string;
  estimatedExposure: string;
  bestFor: string;
  tone: "starter" | "growth" | "gold";
  reviewRequired?: boolean;
}

export interface PromotionOrder {
  id: string;
  songId: string;
  packageId: string;
  status: "mock_created";
  createdAt: string;
}

export interface CreatorChallenge {
  id: string;
  title: string;
  theme: string;
  prizePoolUsdc: number;
  endsIn: string;
  submissionCount: number;
  rewards: Array<{ rank: string; reward: string }>;
  leaderboard: ChallengeEntry[];
  rules: string[];
}

export interface ChallengeEntry {
  rank: number;
  songId: string;
  coverUrl: string;
  title: string;
  creatorName: string;
  playCount: number;
  likesCount: number;
  creatorPoints: number;
}

export interface MarketplaceSong extends FeedItem {
  lane: "hot" | "new" | "challenge" | "recommended";
  creatorPoints: number;
}

const MOCK_AUDIO =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function cover(title: string, accent = "#59ffc8"): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <defs>
    <radialGradient id="g" cx="34%" cy="26%" r="76%">
      <stop offset="0%" stop-color="#a8ffd8"/>
      <stop offset="52%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="#041a15"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <rect width="800" height="800" rx="98" fill="url(#g)"/>
  <circle cx="410" cy="382" r="170" fill="#02110d" opacity=".86"/>
  <circle cx="410" cy="382" r="66" fill="#ffd87a"/>
  <path d="M84 560 C230 420 316 670 486 500 S670 336 750 472" fill="none" stroke="#f4f1e8" stroke-width="26" stroke-linecap="round" opacity=".48" filter="url(#blur)"/>
  <path d="M80 604 C230 492 344 642 514 512 C622 430 690 430 756 498" fill="none" stroke="#ffd87a" stroke-width="15" stroke-linecap="round" opacity=".78"/>
  <text x="72" y="700" fill="#f4f1e8" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="800">${title}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

const marketplaceSongs: MarketplaceSong[] = [
  {
    id: "mock-market-rain-garden",
    userId: "mock-creator-01",
    title: "雨后的植物园",
    theme: "雨水停在温室玻璃上，绿色旋律慢慢亮起来。",
    style: "Art Pop",
    mood: "希望",
    lyrics: "雨后的叶子 / 把城市重新唱醒",
    audioUrl: MOCK_AUDIO,
    coverUrl: cover("雨后的植物园"),
    mode: "vocal",
    visibility: "public",
    likesCount: 840,
    favoritesCount: 236,
    viewCount: 38400,
    playCount: 12680,
    commentsCount: 118,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    creatorName: "Mira Green",
    likedByMe: false,
    favoritedByMe: false,
    lane: "hot",
    creatorPoints: 4560
  },
  {
    id: "mock-market-night-coast",
    userId: "mock-creator-02",
    title: "夜海电台",
    theme: "午夜海边的低频鼓点，像远处灯塔的回声。",
    style: "Lo-fi R&B",
    mood: "沉静",
    lyrics: "",
    audioUrl: MOCK_AUDIO,
    coverUrl: cover("夜海电台", "#6faeff"),
    mode: "instrumental",
    visibility: "public",
    likesCount: 392,
    favoritesCount: 91,
    viewCount: 16400,
    playCount: 5720,
    commentsCount: 42,
    createdAt: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
    publishedAt: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    creatorName: "North Room",
    likedByMe: false,
    favoritedByMe: true,
    lane: "new",
    creatorPoints: 1880
  },
  {
    id: "mock-market-sunroom",
    userId: "mock-creator-03",
    title: "玻璃暖房",
    theme: "一首适合清晨做咖啡时播放的温柔电子民谣。",
    style: "Indie Folk",
    mood: "舒服",
    lyrics: "光落在杯口 / 我们慢慢往前走",
    audioUrl: MOCK_AUDIO,
    coverUrl: cover("玻璃暖房", "#ffd87a"),
    mode: "vocal",
    visibility: "public",
    likesCount: 514,
    favoritesCount: 168,
    viewCount: 22800,
    playCount: 9040,
    commentsCount: 76,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 17).toISOString(),
    creatorName: "Ari Studio",
    likedByMe: true,
    favoritedByMe: false,
    lane: "challenge",
    creatorPoints: 3340
  },
  {
    id: "mock-market-aurora-run",
    userId: "mock-creator-04",
    title: "Aurora Run",
    theme: "年轻、自由、适合短视频开头的未来放克。",
    style: "Future Funk",
    mood: "年轻",
    lyrics: "",
    audioUrl: MOCK_AUDIO,
    coverUrl: cover("Aurora Run", "#ff8f6b"),
    mode: "instrumental",
    visibility: "public",
    likesCount: 286,
    favoritesCount: 72,
    viewCount: 9800,
    playCount: 3240,
    commentsCount: 24,
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    publishedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    creatorName: "Young Leaf",
    likedByMe: false,
    favoritedByMe: false,
    lane: "recommended",
    creatorPoints: 1260
  }
];

export async function getCreatorStats(): Promise<CreatorStats> {
  return {
    monthImpressions: 186400,
    monthPlays: 42860,
    engagementCount: 5820,
    creatorPoints: 4560,
    estimatedUsdcRange: "38~52",
    settlementStatus: "pending"
  };
}

export async function getCreatorFund(): Promise<CreatorFund> {
  return {
    poolUsdc: 12500,
    totalPlatformPoints: 1280000,
    myPoints: 4560,
    estimatedShareRange: "38~52 USDC",
    settlementNote: "最终奖励根据月底全站积分占比、真实互动质量和风控结果结算。"
  };
}

export async function getCreatorGrowth(): Promise<GrowthPoint[]> {
  return [
    { label: "周一", impressions: 18200, plays: 4100, points: 410 },
    { label: "周二", impressions: 24600, plays: 5200, points: 560 },
    { label: "周三", impressions: 31200, plays: 7600, points: 820 },
    { label: "周四", impressions: 28600, plays: 6900, points: 710 },
    { label: "周五", impressions: 36200, plays: 9400, points: 980 },
    { label: "周六", impressions: 47600, plays: 9680, points: 1080 }
  ];
}

export async function getPromotionPackages(): Promise<PromotionPackage[]> {
  return [
    {
      id: "starter-flight",
      name: "新人起飞包",
      priceUsdc: "9.9 USDC",
      estimatedExposure: "3,000~5,000",
      bestFor: "首次发布作品",
      tone: "starter"
    },
    {
      id: "hot-rank",
      name: "热门冲榜包",
      priceUsdc: "49 USDC",
      estimatedExposure: "20,000~50,000",
      bestFor: "已有互动的优质作品",
      tone: "growth"
    },
    {
      id: "editorial-sprint",
      name: "官方精选冲刺",
      priceUsdc: "99 USDC",
      estimatedExposure: "精选推荐池审核",
      bestFor: "冲击排行榜和挑战赛",
      tone: "gold",
      reviewRequired: true
    }
  ];
}

export async function createPromotionOrder(song: Song | FeedItem, pack: PromotionPackage): Promise<PromotionOrder> {
  return {
    id: `promo-${Date.now()}`,
    songId: song.id,
    packageId: pack.id,
    status: "mock_created",
    createdAt: new Date().toISOString()
  };
}

export async function getChallenges(): Promise<CreatorChallenge> {
  return {
    id: "weekly-rain-garden",
    title: "本周AI音乐挑战赛",
    theme: "雨后的植物园",
    prizePoolUsdc: 500,
    endsIn: "3天12小时",
    submissionCount: 1284,
    rewards: [
      { rank: "第1名", reward: "150 USDC" },
      { rank: "第2名", reward: "80 USDC" },
      { rank: "第3名", reward: "50 USDC" },
      { rank: "入围作品", reward: "积分奖励" }
    ],
    leaderboard: marketplaceSongs.slice(0, 3).map((song, index) => ({
      rank: index + 1,
      songId: song.id,
      coverUrl: song.coverUrl ?? "",
      title: song.title,
      creatorName: song.creatorName,
      playCount: song.playCount,
      likesCount: song.likesCount,
      creatorPoints: song.creatorPoints
    })),
    rules: [
      "禁止刷量，异常播放不计入排名。",
      "排名综合真实播放、完播率、点赞、收藏、评论计算。",
      "奖金池按最终审核结果发放，预计数据会随互动质量浮动。"
    ]
  };
}

export async function joinChallenge(song: Song, challenge: CreatorChallenge): Promise<CreatorChallenge> {
  return {
    ...challenge,
    submissionCount: challenge.submissionCount + 1,
    leaderboard: [
      {
        rank: 9,
        songId: song.id,
        coverUrl: song.coverUrl ?? "",
        title: song.title,
        creatorName: "你",
        playCount: song.playCount,
        likesCount: song.likesCount,
        creatorPoints: Math.max(220, Math.round(song.playCount * 0.18 + song.likesCount * 4 + song.commentsCount * 5))
      },
      ...challenge.leaderboard
    ].slice(0, 6)
  };
}

export async function getMarketplaceSongs(): Promise<MarketplaceSong[]> {
  return marketplaceSongs;
}

export async function claimUsdcReward(stats: CreatorStats): Promise<{ status: SettlementStatus; message: string }> {
  if (stats.settlementStatus === "available") {
    return { status: "reviewing", message: "USDC 结算申请已提交，等待后台审核。" };
  }
  if (stats.settlementStatus === "reviewing") {
    return { status: "reviewing", message: "你的结算申请正在审核中。" };
  }
  if (stats.settlementStatus === "paid") {
    return { status: "paid", message: "本月创作者奖励已发放。" };
  }
  return { status: "pending", message: "本月还未结算，结算完成后开放申请。" };
}

export function getMockComments(songId: string): Comment[] {
  const song = marketplaceSongs.find((item) => item.id === songId);
  if (!song) {
    return [];
  }
  return [
    {
      id: `${songId}-comment-1`,
      songId,
      userName: "Garden Listener",
      body: "这个旋律很有画面感，适合放在挑战赛里。",
      likesCount: 12,
      likedByMe: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 46).toISOString()
    },
    {
      id: `${songId}-comment-2`,
      songId,
      userName: "Sound Curator",
      body: "封面和情绪很统一，副歌如果再亮一点会更容易被收藏。",
      likesCount: 8,
      likedByMe: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString()
    }
  ];
}

export function isMockSong(songId?: string | null): boolean {
  return Boolean(songId?.startsWith("mock-"));
}
