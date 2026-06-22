import { ApiError, type FeedItem, type MusicTask, type MvTask, type Plan, type Song } from "../api";

export function friendlyTaskError(task: Pick<MusicTask | MvTask, "errorCode" | "errorMessage">): string {
  return friendlyErrorMessage(new Error(task.errorMessage || task.errorCode || "生成失败，额度已返还。"));
}

export function friendlyErrorMessage(unknown: unknown): string {
  const raw =
    unknown instanceof ApiError || unknown instanceof Error
      ? unknown.message
      : typeof unknown === "string"
        ? unknown
        : "操作失败，请稍后重试。";
  const lower = raw.toLowerCase();

  if (lower.includes("minimax") && (lower.includes("timed out") || lower.includes("timeout"))) {
    return "AI 生成服务响应超时，本次任务已结束；如果消耗了额度，系统会自动返还。请稍后重新生成。";
  }

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborterror")) {
    return "请求等待时间过长，请稍后重试。";
  }

  if (lower.includes("missing_minimax_api_key") || lower.includes("api key")) {
    return "AI 音乐服务配置未完成，请联系管理员检查后端密钥。";
  }

  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("网络连接失败")) {
    return "网络连接失败，请确认服务在线后再试。";
  }

  if (lower.includes("song not found")) {
    return "没有找到这首作品，请回到作品栏刷新后重新打开。";
  }

  if (lower.includes("request failed") || lower.includes("internal server error")) {
    return "服务器暂时不可用，请稍后重试。";
  }

  if (/^[\x00-\x7F]+$/.test(raw) && raw.length > 0) {
    return "操作失败，请稍后重试。";
  }

  return raw || "操作失败，请稍后重试。";
}

export function statusLabel(status: MusicTask["status"]): string {
  const labels: Record<MusicTask["status"], string> = {
    queued: "排队中",
    generating: "生成中",
    succeeded: "已完成",
    failed: "失败"
  };
  return labels[status];
}

export function extractKeywords(value: string): string[] {
  const preset = ["希望", "自由", "成长", "雨后", "森林", "夜晚", "浪漫", "城市", "温柔", "重启", "光", "海"];
  const found = preset.filter((keyword) => value.includes(keyword));
  return (found.length ? found : ["舒服", "灵感", "人声"]).slice(0, 4);
}

export function titleFromTheme(theme: string): string {
  const clean = theme.trim();
  if (!clean) {
    return "未命名作品";
  }
  return clean.length > 18 ? `${clean.slice(0, 18)}...` : clean;
}

export function safeFileName(value: string): string {
  return (value.trim() || "green-sonic-song").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
}

export function openExternalUrl(url: string): void {
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(url);
  }
}

export async function writeClipboardText(value: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
  } catch {
    // Fall back to the textarea path for older mobile browsers or denied clipboard permissions.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("复制失败，请手动复制浏览器地址栏链接。");
  }
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatPoints(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function planLabel(plan: Plan): string {
  const labels: Record<Plan, string> = {
    free: "免费版",
    pro: "专业版",
    creator: "创作者版"
  };
  return labels[plan];
}

export function planMeets(current: Plan, required: Plan): boolean {
  const rank: Record<Plan, number> = { free: 0, pro: 1, creator: 2 };
  return rank[current] >= rank[required];
}

export function displayNameLabel(value: string | null | undefined): string {
  const name = (value ?? "").trim();
  if (!name || name === "Creator") {
    return "创作者";
  }
  if (name === "Demo Creator") {
    return "演示创作者";
  }
  if (name.startsWith("Demo Creator ")) {
    return name.replace(/^Demo Creator/, "演示创作者");
  }
  if (name.startsWith("Creator ")) {
    return name.replace(/^Creator/, "创作者");
  }
  return name;
}

export function displayInitial(value: string | null | undefined): string {
  return (displayNameLabel(value).slice(0, 1) || "G").toUpperCase();
}

export function creatorHandle(value: string | null | undefined): string {
  const label = displayNameLabel(value);
  const normalized = label
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "");
  return normalized || "creator";
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatRelativeTime(value: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

export function isFeedItem(song: Song | FeedItem): song is FeedItem {
  return "creatorName" in song;
}

export function uniqueCreators(feed: FeedItem[]) {
  const map = new Map<string, { id: string; name: string; plays: number }>();
  for (const song of feed) {
    const current = map.get(song.userId);
    map.set(song.userId, {
      id: song.userId,
      name: song.creatorName,
      plays: (current?.plays ?? 0) + (song.playCount ?? 0)
    });
  }
  return Array.from(map.values()).slice(0, 8);
}

export function shortAddress(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function upsertSong(list: Song[], nextSong: Song): Song[] {
  const exists = list.some((song) => song.id === nextSong.id);
  if (!exists) {
    return [nextSong, ...list];
  }
  return list.map((song) => (song.id === nextSong.id ? { ...song, ...nextSong } : song));
}

export function mergeSongCandidates(songs: Song[], fallbackSong: Song | null): Song[] {
  const merged = fallbackSong ? upsertSong(songs, fallbackSong) : songs;
  return merged.filter((song) => Boolean(song.id && song.audioUrl));
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
