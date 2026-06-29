import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  ApiSession,
  Comment,
  CreatorProfile,
  DailyChallenge,
  FeedItem,
  GenerateMusicRequest,
  MusicTask,
  MvTask,
  Plan,
  RewardHistory,
  Song,
  claimReward,
  clearSession,
  createComment,
  createGuestSession,
  createMvTask,
  createTestSession,
  generateMusic,
  getApiBaseUrl,
  getDailyChallenge,
  getCreatorProfile,
  getFeed,
  getMe,
  getMusicTask,
  getMvTask,
  getMyMusicTasks,
  getMyMvTasks,
  getMySongs,
  getRewardHistory,
  getSong,
  getSongComments,
  loadSession,
  publishSong,
  saveSession,
  submitChallenge,
  toggleCommentLike,
  trackSongPlay,
  trackSongView,
  toggleFavorite,
  toggleFollow,
  toggleLike
} from "./api";
import { AuroraFrame, ControlGroup, CoverArt, EmptyState, Metric, StatusPill } from "./components/common";
import { emptyRewards, initialForm, initialTabFromUrl, moodOptions, starterPrompts, styleOptions, tabs } from "./constants";
import {
  creatorHandle,
  displayInitial,
  displayNameLabel,
  extractKeywords,
  formatCompact,
  formatDate,
  formatPoints,
  formatRelativeTime,
  friendlyErrorMessage,
  friendlyTaskError,
  isFeedItem,
  mergeSongCandidates,
  openExternalUrl,
  planLabel,
  planMeets,
  safeFileName,
  shortAddress,
  statusLabel,
  titleFromTheme,
  uniqueCreators,
  upsertSong,
  wait,
  writeClipboardText
} from "./lib/format";
import {
  claimUsdcReward,
  createPromotionOrder,
  getChallenges,
  getCreatorFund,
  getCreatorGrowth,
  getCreatorStats,
  getMarketplaceSongs,
  getMockComments,
  getPromotionPackages,
  isMockSong,
  joinChallenge,
  type CreatorChallenge,
  type CreatorFund,
  type CreatorStats,
  type GrowthPoint,
  type MarketplaceSong,
  type PromotionOrder,
  type PromotionPackage,
  type SettlementStatus
} from "./mock/creatorEconomy";
import type { BeforeInstallPromptEvent, BusyKey, PendingMvDraft, Tab } from "./types";

const MV_FEATURE_ENABLED = false;

export default function App() {
  const [session, setSession] = useState<ApiSession | null>(() => loadSession());
  const [activeTab, setActiveTab] = useState<Tab>(() => initialTabFromUrl());
  const [busy, setBusy] = useState<BusyKey>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareSong, setShareSong] = useState<Song | FeedItem | null>(null);
  const [commentSong, setCommentSong] = useState<Song | FeedItem | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [fontScale, setFontScale] = useState(1);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [form, setForm] = useState<GenerateMusicRequest>(initialForm);
  const [tasks, setTasks] = useState<MusicTask[]>([]);
  const [mvTasks, setMvTasks] = useState<MvTask[]>([]);
  const [currentTask, setCurrentTask] = useState<MusicTask | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [rewards, setRewards] = useState<RewardHistory>(emptyRewards);
  const [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null);
  const [creatorFund, setCreatorFund] = useState<CreatorFund | null>(null);
  const [creatorGrowth, setCreatorGrowth] = useState<GrowthPoint[]>([]);
  const [promotionPackages, setPromotionPackages] = useState<PromotionPackage[]>([]);
  const [promotionOrders, setPromotionOrders] = useState<PromotionOrder[]>([]);
  const [creatorChallenge, setCreatorChallenge] = useState<CreatorChallenge | null>(null);
  const [marketplaceSongs, setMarketplaceSongs] = useState<MarketplaceSong[]>([]);
  const [promotionSong, setPromotionSong] = useState<Song | FeedItem | null>(null);
  const [challengePrefillSong, setChallengePrefillSong] = useState<Song | FeedItem | null>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const [withdrawDraft, setWithdrawDraft] = useState({ walletAddress: "", amountPoints: "1000" });
  const [viewedSongIds, setViewedSongIds] = useState<string[]>([]);
  const [playedSongIds, setPlayedSongIds] = useState<string[]>([]);
  const [sharedSongHandled, setSharedSongHandled] = useState(false);
  const pendingMvDraftRef = useRef<PendingMvDraft | null>(null);

  const canGenerate = form.theme.trim().length >= 4 && form.style.trim() && form.mood.trim();
  const selectedAudioUrl = selectedSong?.audioUrl ?? currentTask?.audioUrl ?? null;
  const selectedLyrics = selectedSong?.lyrics ?? currentTask?.lyrics ?? null;
  const selectedTitle = selectedSong?.title ?? currentTask?.title ?? "未命名作品";

  const showMessage = useCallback((message: string) => {
    setToast(message);
    setError(null);
  }, []);

  const showError = useCallback((unknown: unknown) => {
    setError(friendlyErrorMessage(unknown));
    setToast(null);
  }, []);

  const refreshLibrary = useCallback(async () => {
    const [nextSongs, nextTasks, nextMvTasks] = await Promise.all([
      getMySongs(),
      getMyMusicTasks(),
      MV_FEATURE_ENABLED ? getMyMvTasks() : Promise.resolve([])
    ]);
    setSongs(nextSongs);
    setTasks(nextTasks);
    setMvTasks(nextMvTasks);
    return nextSongs;
  }, []);

  const refreshFeed = useCallback(async () => {
    setFeed(await getFeed());
  }, []);

  const refreshChallenge = useCallback(async () => {
    setChallenge(await getDailyChallenge());
  }, []);

  const refreshRewards = useCallback(async () => {
    setRewards(await getRewardHistory());
  }, []);

  const refreshCreatorEconomy = useCallback(async () => {
    const [stats, fund, growth, packages, nextChallenge, nextMarketplace] = await Promise.all([
      getCreatorStats(),
      getCreatorFund(),
      getCreatorGrowth(),
      getPromotionPackages(),
      getChallenges(),
      getMarketplaceSongs()
    ]);
    setCreatorStats(stats);
    setCreatorFund(fund);
    setCreatorGrowth(growth);
    setPromotionPackages(packages);
    setCreatorChallenge(nextChallenge);
    setMarketplaceSongs(nextMarketplace);
  }, []);

  const bootstrap = useCallback(async (options: { createGuest?: boolean } = {}) => {
    setBusy("bootstrap");
    try {
      if (!loadSession() && options.createGuest) {
        const guest = await createGuestSession();
        setSession(saveSession(guest));
      }
      const [me] = await Promise.all([getMe(), refreshLibrary(), refreshFeed(), refreshChallenge(), refreshRewards()]);
      setSession(saveSession(me));
    } catch (unknown) {
      if (unknown instanceof ApiError && unknown.status === 401) {
        try {
          clearSession();
          const guest = await createGuestSession();
          setSession(saveSession(guest));
          const [me] = await Promise.all([getMe(), refreshLibrary(), refreshFeed(), refreshChallenge(), refreshRewards()]);
          setSession(saveSession(me));
          showMessage("本机身份已自动刷新，可以继续创作。");
          return;
        } catch (recoveryError) {
          showError(recoveryError);
          return;
        }
      }
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }, [refreshChallenge, refreshFeed, refreshLibrary, refreshRewards, showError, showMessage]);

  async function openSharedSong(songId: string) {
    const cached = songs.find((song) => song.id === songId) ?? feed.find((song) => song.id === songId);
    if (cached) {
      await openSong(cached);
    } else {
      await openSong(await getSong(songId));
    }
    window.history.replaceState(null, "", window.location.pathname);
  }

  useEffect(() => {
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  useEffect(() => {
    void bootstrap({ createGuest: !session });
  }, [bootstrap, session?.userId]);

  useEffect(() => {
    void refreshCreatorEconomy().catch(showError);
  }, [refreshCreatorEconomy, showError]);

  useEffect(() => {
    if (!session || sharedSongHandled) {
      return;
    }
    const songId = new URLSearchParams(window.location.search).get("song")?.trim();
    setSharedSongHandled(true);
    if (!songId) {
      return;
    }
    void openSharedSong(songId).catch(showError);
  }, [session, sharedSongHandled, showError]);

  async function handleInstall() {
    if (!installPrompt) {
      showMessage("在 Safari 或 Chrome 菜单里选择“添加到主屏幕”，即可像 App 一样打开。");
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function handleGenerate(event?: FormEvent, mvDraft?: PendingMvDraft | null) {
    event?.preventDefault();
    if (!canGenerate) {
      showError(new Error("请先填写至少 4 个字的灵感，并选择风格和情绪。"));
      return;
    }
    if (busy) {
      showMessage(busy === "bootstrap" ? "正在同步账号和作品，完成后即可生成。" : "上一项操作正在处理，请稍后再试。");
      return;
    }
    pendingMvDraftRef.current = MV_FEATURE_ENABLED && mvDraft?.enabled ? mvDraft : null;
    setBusy("generate");
    setError(null);
    setToast(null);
    setCurrentTask(null);
    try {
      const response = await generateMusic({
        ...form,
        title: form.title?.trim() || titleFromTheme(form.theme),
        theme: form.theme.trim(),
        lyrics: form.lyrics?.trim()
      });
      setCurrentTask(response.task);
      setActiveTab("generating");
      showMessage("已进入生成队列，PWA 会自动刷新任务状态。");
      if (response.task.status === "succeeded") {
        await completeTask(response.task);
      } else {
        void pollTask(response.task.id);
      }
    } catch (unknown) {
      if (unknown instanceof ApiError && unknown.status === 0 && (await recoverPendingGenerationAfterTimeout())) {
        return;
      }
      pendingMvDraftRef.current = null;
      setActiveTab("home");
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  async function recoverPendingGenerationAfterTimeout(): Promise<boolean> {
    try {
      showMessage("生成请求仍在同步，我正在帮你检查是否已创建任务。");
      const [nextTasks, nextSongs] = await Promise.all([getMyMusicTasks(), getMySongs()]);
      setTasks(nextTasks);
      setSongs(nextSongs);
      const candidate = findRecoverableGenerationTask(nextTasks, form);
      if (!candidate) {
        return false;
      }

      setCurrentTask(candidate);
      if (candidate.status === "succeeded") {
        await completeTask(candidate);
        return true;
      }

      setActiveTab("generating");
      showMessage("已找到生成任务，继续为你等待结果。");
      void pollTask(candidate.id);
      return true;
    } catch {
      return false;
    }
  }

  async function pollTask(taskId: string) {
    let transientFailures = 0;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await wait(attempt < 2 ? 1800 : 3200);
      try {
        const task = await getMusicTask(taskId);
        transientFailures = 0;
        setCurrentTask(task);
        if (task.status === "succeeded") {
          await completeTask(task);
          return;
        }
        if (task.status === "failed") {
          showError(new Error(task.errorMessage || "生成失败，额度已自动返还。"));
          return;
        }
      } catch (unknown) {
        if (unknown instanceof ApiError && (unknown.status === 0 || unknown.status === 404) && transientFailures < 12) {
          transientFailures += 1;
          showMessage(unknown.status === 404 ? "任务状态正在同步，继续为你等待生成结果。" : "线上连接短暂中断，正在继续等待生成结果。");
          continue;
        }
        showError(unknown);
        return;
      }
    }
    showError(new Error("任务仍在生成中，你可以稍后回到作品栏查看结果。"));
  }

  async function completeTask(task: MusicTask) {
    const nextSongs = await refreshLibrary();
    await refreshRewards();
    const song = nextSongs.find((item) => item.id === task.songId || item.taskId === task.id) ?? null;
    const mvDraft = pendingMvDraftRef.current;
    pendingMvDraftRef.current = null;
    let createdMvTask: MvTask | null = null;
    if (MV_FEATURE_ENABLED && song && mvDraft?.enabled) {
      try {
        const response = await createMvTask({
          songId: song.id,
          prompt: mvDraft.prompt || undefined,
          imageCount: mvDraft.imageCount,
          imageNames: mvDraft.imageNames
        });
        createdMvTask = response.task;
        setMvTasks((current) => [response.task, ...current.filter((item) => item.id !== response.task.id)]);
      } catch (unknown) {
        showError(unknown);
      }
    }
    if (song) {
      setSelectedSong(song);
      setActiveTab("detail");
    }
    showMessage(createdMvTask ? "歌曲生成完成，MV 制作任务已创建。" : "歌曲生成完成，已保存到作品栏。");
  }

  async function handleOpenMvTask(task: MvTask) {
    if (!MV_FEATURE_ENABLED) {
      showMessage("MV 制作功能暂未开放，当前版本先专注歌曲创作和社区互动。");
      return;
    }

    if (task.status === "succeeded" && task.videoUrl) {
      openExternalUrl(task.videoUrl);
      return;
    }

    setBusy("mv");
    try {
      const nextTask = await getMvTask(task.id);
      setMvTasks((current) => current.map((item) => (item.id === nextTask.id ? nextTask : item)));
      if (nextTask.status === "succeeded" && nextTask.videoUrl) {
        showMessage("MV 已完成，可以再次点击打开查看。");
      } else if (nextTask.status === "failed") {
        showError(new Error(nextTask.errorMessage || "MV 制作失败，请稍后重试。"));
      } else {
        showMessage("MV 仍在制作中，稍后刷新即可查看。");
      }
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenTask(task: MusicTask) {
    setCurrentTask(task);
    if (task.status !== "succeeded" || !task.songId) {
      setSelectedSong(null);
      setActiveTab("generating");
      return;
    }

    try {
      const song = songs.find((item) => item.id === task.songId || item.taskId === task.id) ?? await getSong(task.songId);
      setSelectedSong(song);
      setCurrentTask(task);
      setActiveTab("detail");
      const nextComments = await getSongComments(song.id);
      setComments((current) => ({ ...current, [song.id]: nextComments }));
    } catch (unknown) {
      setSelectedSong(null);
      setActiveTab("generating");
      showError(unknown);
    }
  }

  async function handlePublish(songId?: string | null) {
    if (!songId || busy) {
      return;
    }
    setBusy("publish");
    try {
      const response = await publishSong(songId);
      setSelectedSong(response.song);
      setSongs((current) => upsertSong(current, response.song));
      const refreshResults = await Promise.allSettled([refreshLibrary(), refreshFeed(), refreshRewards()]);
      if (refreshResults.some((result) => result.status === "rejected")) {
        showMessage("已发布成功，部分列表稍后会自动同步。");
        return;
      }
      showMessage(response.awardedPoints > 0 ? `已发布到音乐广场，获得 ${response.awardedPoints} 积分。` : "作品已是公开状态。");
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  function mergeSongUpdate(updated: Song) {
    setSelectedSong((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    setSongs((current) => upsertSong(current, updated));
    setFeed((current) => current.map((song) => (song.id === updated.id ? { ...song, ...updated } : song)));
  }

  function mergeFeedUpdate(updated: FeedItem) {
    const counters = {
      likesCount: updated.likesCount,
      favoritesCount: updated.favoritesCount,
      viewCount: updated.viewCount,
      playCount: updated.playCount,
      commentsCount: updated.commentsCount
    };
    setFeed((current) => current.map((song) => (song.id === updated.id ? updated : song)));
    setSelectedSong((current) => (current?.id === updated.id ? { ...current, ...counters } : current));
    setSongs((current) => current.map((song) => (song.id === updated.id ? { ...song, ...counters } : song)));
  }

  function mergeCommentCount(songId: string, commentsCount: number) {
    setSelectedSong((current) => (current?.id === songId ? { ...current, commentsCount } : current));
    setSongs((current) => current.map((song) => (song.id === songId ? { ...song, commentsCount } : song)));
    setFeed((current) => current.map((song) => (song.id === songId ? { ...song, commentsCount } : song)));
  }

  function patchMockSong(songId: string, updater: <T extends Song | FeedItem | MarketplaceSong>(song: T) => T) {
    setMarketplaceSongs((current) => current.map((song) => (song.id === songId ? updater(song) : song)));
    setSelectedSong((current) => (current?.id === songId ? updater(current) : current));
    setPromotionSong((current) => (current?.id === songId ? updater(current) : current));
    setChallengePrefillSong((current) => (current?.id === songId ? updater(current) : current));
  }

  async function handleTrackView(songId: string) {
    if (viewedSongIds.includes(songId)) {
      return;
    }
    setViewedSongIds((current) => (current.includes(songId) ? current : [...current, songId]));
    if (isMockSong(songId)) {
      patchMockSong(songId, <T extends Song | FeedItem | MarketplaceSong>(song: T) => ({
        ...song,
        viewCount: (song.viewCount ?? 0) + 1
      }) as T);
      return;
    }
    try {
      mergeSongUpdate(await trackSongView(songId));
    } catch {
      // Viewing should never block playback or comments.
    }
  }

  async function handleTrackPlay(songId?: string | null) {
    if (!songId || playedSongIds.includes(songId)) {
      return;
    }
    setPlayedSongIds((current) => (current.includes(songId) ? current : [...current, songId]));
    if (isMockSong(songId)) {
      patchMockSong(songId, <T extends Song | FeedItem | MarketplaceSong>(song: T) => ({
        ...song,
        playCount: song.playCount + 1
      }) as T);
      return;
    }
    try {
      mergeSongUpdate(await trackSongPlay(songId));
    } catch {
      // Playback must stay responsive even if analytics fails.
    }
  }

  async function openSong(song: Song | FeedItem) {
    setSelectedSong(song);
    setCurrentTask(null);
    setActiveTab("detail");
    void handleTrackView(song.id);
    if (isMockSong(song.id)) {
      setComments((current) => ({ ...current, [song.id]: current[song.id] ?? getMockComments(song.id) }));
      return;
    }
    try {
      const nextComments = await getSongComments(song.id);
      setComments((current) => ({ ...current, [song.id]: nextComments }));
    } catch {
      setComments((current) => ({ ...current, [song.id]: current[song.id] ?? [] }));
    }
  }

  async function openComments(song: Song | FeedItem) {
    setCommentSong(song);
    setSelectedSong(song);
    void handleTrackView(song.id);
    if (isMockSong(song.id)) {
      setComments((current) => ({ ...current, [song.id]: current[song.id] ?? getMockComments(song.id) }));
      return;
    }
    try {
      const nextComments = await getSongComments(song.id);
      setComments((current) => ({ ...current, [song.id]: nextComments }));
    } catch (unknown) {
      showError(unknown);
    }
  }

  async function openCreatorProfile(creatorId: string) {
    try {
      setCreatorProfile(await getCreatorProfile(creatorId));
    } catch (unknown) {
      showError(unknown);
    }
  }

  async function handleToggleFollow(creatorId: string, following: boolean) {
    setBusy("follow");
    try {
      const profile = await toggleFollow(creatorId, following);
      setCreatorProfile(profile);
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  async function handleComment(songId?: string) {
    if (!songId || !commentDraft.trim() || busy === "comment") {
      return;
    }
    setBusy("comment");
    try {
      if (isMockSong(songId)) {
        const comment: Comment = {
          id: `${songId}-local-${Date.now()}`,
          songId,
          userName: session?.displayName ?? "Green Sonic 创作者",
          body: commentDraft.trim(),
          likesCount: 0,
          likedByMe: false,
          createdAt: new Date().toISOString()
        };
        let commentsCount = 0;
        setComments((current) => {
          const list = [...(current[songId] ?? getMockComments(songId)), comment];
          commentsCount = list.length;
          return { ...current, [songId]: list };
        });
        mergeCommentCount(songId, commentsCount);
        patchMockSong(songId, <T extends Song | FeedItem | MarketplaceSong>(song: T) => ({ ...song, commentsCount }) as T);
        setCommentDraft("");
        showMessage("评论已发布。");
        return;
      }
      const response = await createComment(songId, commentDraft.trim());
      setComments((current) => ({ ...current, [songId]: [...(current[songId] ?? []), response.comment] }));
      mergeCommentCount(songId, response.commentsCount ?? ((comments[songId]?.length ?? 0) + 1));
      setCommentDraft("");
      showMessage("评论已发布。");
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleCommentLike(songId: string, comment: Comment) {
    setBusy("commentLike");
    try {
      if (isMockSong(songId)) {
        const nextLiked = !comment.likedByMe;
        setComments((current) => ({
          ...current,
          [songId]: (current[songId] ?? getMockComments(songId)).map((item) =>
            item.id === comment.id
              ? { ...item, likedByMe: nextLiked, likesCount: Math.max(0, item.likesCount + (nextLiked ? 1 : -1)) }
              : item
          )
        }));
        return;
      }
      const updated = await toggleCommentLike(comment.id, !comment.likedByMe);
      setComments((current) => ({
        ...current,
        [songId]: (current[songId] ?? []).map((item) => (item.id === updated.id ? updated : item))
      }));
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleLike(song: FeedItem) {
    if (isMockSong(song.id)) {
      const nextLiked = !song.likedByMe;
      patchMockSong(song.id, <T extends Song | FeedItem | MarketplaceSong>(item: T) => ({
        ...item,
        likedByMe: nextLiked,
        likesCount: Math.max(0, item.likesCount + (nextLiked ? 1 : -1))
      }) as T);
      showMessage(nextLiked ? "已点赞，互动会计入创作者积分预估。" : "已取消点赞。");
      return;
    }
    try {
      const updated = await toggleLike(song.id, !song.likedByMe);
      mergeFeedUpdate(updated);
    } catch (unknown) {
      showError(unknown);
    }
  }

  async function handleToggleFavorite(song: FeedItem) {
    if (isMockSong(song.id)) {
      const nextFavorited = !song.favoritedByMe;
      patchMockSong(song.id, <T extends Song | FeedItem | MarketplaceSong>(item: T) => ({
        ...item,
        favoritedByMe: nextFavorited,
        favoritesCount: Math.max(0, item.favoritesCount + (nextFavorited ? 1 : -1))
      }) as T);
      showMessage(nextFavorited ? "已收藏，后续会进入你的收藏列表。" : "已取消收藏。");
      return;
    }
    try {
      const updated = await toggleFavorite(song.id, !song.favoritedByMe);
      mergeFeedUpdate(updated);
    } catch (unknown) {
      showError(unknown);
    }
  }

  async function handleSubmitChallenge(songId: string) {
    if (!challenge?.id || !songId || busy) {
      return;
    }
    setBusy("submitChallenge");
    try {
      const updated = await submitChallenge(challenge.id, songId);
      setChallenge(updated);
      await Promise.all([refreshFeed(), refreshLibrary()]);
      showMessage("已投稿到每日音乐挑战。");
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  function handleOpenPromotion(song: Song | FeedItem) {
    setPromotionSong(song);
  }

  function handleOpenChallengeFromSong(song: Song | FeedItem) {
    setChallengePrefillSong(song);
    setActiveTab("challenge");
    showMessage("已进入挑战赛，选择你的作品参赛。");
  }

  async function handleCreatePromotionOrder(pack: PromotionPackage) {
    if (!promotionSong || busy) {
      return;
    }
    setBusy("promotion");
    try {
      const order = await createPromotionOrder(promotionSong, pack);
      setPromotionOrders((current) => [order, ...current]);
      setPromotionSong(null);
      showMessage(`已创建「${pack.name}」推广申请，曝光会进入推荐队列审核。`);
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  async function handleJoinCreatorChallenge(songId: string) {
    if (!songId || !creatorChallenge || busy) {
      return;
    }
    const song = songs.find((item) => item.id === songId)
      ?? (selectedSong?.id === songId ? selectedSong : null)
      ?? (challengePrefillSong?.id === songId ? challengePrefillSong : null);
    if (!song || isFeedItem(song)) {
      showError(new Error("请选择自己的作品参赛，广场里的他人作品不能代替投稿。"));
      return;
    }
    setBusy("submitChallenge");
    try {
      const updated = await joinChallenge(song, creatorChallenge);
      setCreatorChallenge(updated);
      showMessage("已提交挑战赛，排名会根据真实播放和互动质量浮动。");
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  async function handleClaimCreatorReward() {
    if (!creatorStats || busy) {
      return;
    }
    setBusy("claim");
    try {
      const result = await claimUsdcReward(creatorStats);
      setCreatorStats({ ...creatorStats, settlementStatus: result.status });
      showMessage(result.message);
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  async function handleSelectTab(tab: Tab) {
    setActiveTab(tab);
    try {
      if (tab === "challenge") {
        await Promise.all([refreshLibrary(), refreshChallenge(), refreshCreatorEconomy()]);
      } else if (tab === "gallery" || tab === "rewards") {
        await Promise.all([tab === "gallery" ? refreshFeed() : refreshRewards(), refreshCreatorEconomy()]);
      }
    } catch (unknown) {
      showError(unknown);
    }
  }

  async function handleWithdraw(event: FormEvent) {
    event.preventDefault();
    const amountPoints = Number(withdrawDraft.amountPoints);
    if (!withdrawDraft.walletAddress.trim() || !Number.isFinite(amountPoints) || amountPoints <= 0 || busy) {
      showError(new Error("请填写有效的钱包地址和兑换积分。"));
      return;
    }
    const minWithdrawalPoints = rewards.settings?.minWithdrawalPoints ?? 10;
    if (amountPoints < minWithdrawalPoints) {
      showError(new Error(`最低兑换门槛为 ${minWithdrawalPoints} 积分。`));
      return;
    }
    setBusy("withdraw");
    try {
      await claimReward({ walletAddress: withdrawDraft.walletAddress.trim(), amountPoints });
      await refreshRewards();
      showMessage("USDC 申请已提交，等待风控审核。");
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  function handleResetIdentity() {
    clearSession();
    setSession(null);
    setActiveTab("home");
    setTasks([]);
    setSongs([]);
    setFeed([]);
    setRewards(emptyRewards);
    setChallenge(null);
    setSelectedSong(null);
    setCurrentTask(null);
    setProfileOpen(false);
    setSettingsOpen(false);
    setShareSong(null);
    setCommentSong(null);
    setCreatorProfile(null);
    setViewedSongIds([]);
    setPlayedSongIds([]);
    setToast("已重置本机创作者身份。");
  }

  async function handleUseTestAccount() {
    if (busy) {
      showMessage("上一项操作正在处理，稍后再切换测试账号。");
      return;
    }
    setBusy("bootstrap");
    setError(null);
    setToast(null);
    try {
      const auth = await createTestSession();
      setSession(saveSession(auth));
      setCurrentTask(null);
      setProfileOpen(false);
      setSettingsOpen(false);
      setShareSong(null);
      setCommentSong(null);
      setCreatorProfile(null);
      const [nextSongs] = await Promise.all([refreshLibrary(), refreshFeed(), refreshChallenge(), refreshRewards()]);
      const demoSong = nextSongs.find((song) => song.title === "海边咖啡") ?? nextSongs[0] ?? null;
      if (demoSong) {
        setSelectedSong(demoSong);
        setActiveTab("detail");
        const nextComments = await getSongComments(demoSong.id);
        setComments((current) => ({ ...current, [demoSong.id]: nextComments }));
      } else {
        setSelectedSong(null);
        setActiveTab("profile");
      }
      showMessage("已切换到测试账号，作品栏已包含一首示例歌曲。");
    } catch (unknown) {
      showError(unknown);
    } finally {
      setBusy(null);
    }
  }

  const marketplaceFeed = useMemo(() => {
    const seen = new Set(feed.map((song) => song.id));
    return [
      ...feed,
      ...marketplaceSongs.filter((song) => !seen.has(song.id))
    ];
  }, [feed, marketplaceSongs]);
  const likedSongs = useMemo(() => marketplaceFeed.filter((song) => song.likedByMe), [marketplaceFeed]);
  const favoriteSongs = useMemo(() => marketplaceFeed.filter((song) => song.favoritedByMe), [marketplaceFeed]);

  const shellStats = useMemo(
    () => [
      { label: "作品", value: songs.length },
      { label: "公开", value: songs.filter((song) => song.visibility === "public").length },
      { label: "积分", value: rewards.balance }
    ],
    [rewards.balance, songs]
  );

  if (!session) {
    return (
      <AuroraFrame>
        <main className="auth-screen">
          <section className="auth-hero glass-card">
            <div className="record-orbit">
              <span />
            </div>
            <p className="gold-label">Green Sonic Aurora</p>
            <h1>正在打开创作空间</h1>
            <p>无需注册登录，正在为这台设备准备本机创作者身份。</p>
            <div className="mini-wave" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <i key={index} style={{ animationDelay: `${index * 90}ms` }} />
              ))}
            </div>
          </section>
          {error && <section className="auth-panel glass-card"><p className="inline-error">{error}</p></section>}
        </main>
      </AuroraFrame>
    );
  }

  return (
    <AuroraFrame>
      <div className="app-shell" style={{ "--ui-scale": fontScale } as CSSProperties}>
        <header className="topbar">
          <button className="brand profile-trigger" type="button" onClick={() => setProfileOpen(true)} aria-label="打开个人中心">
            <span className="brand-mark">
              G
              <em>我的</em>
            </span>
            <span>
              <strong>Green Sonic Gallery</strong>
              <small>{displayNameLabel(session.displayName)} · {planLabel(session.plan)} · 点击查看</small>
            </span>
          </button>
          <div className="topbar-actions">
            <button className="membership-button" type="button" onClick={() => setActiveTab("rewards")}>
              会员
            </button>
            <button className="install-button" type="button" onClick={handleInstall} disabled={isStandalone}>
              {isStandalone ? "已安装" : "安装 PWA"}
            </button>
          </div>
        </header>

        {(toast || error) && (
          <div className={`system-banner ${error ? "is-error" : ""}`} role="status">
            {error ?? toast}
          </div>
        )}

        {busy === "bootstrap" && <div className="system-banner">正在同步线上作品和任务...</div>}

        <main className="view-stack">
          {activeTab === "home" && (
            <HomePage
              form={form}
              setForm={setForm}
              tasks={tasks}
              mvTasks={mvTasks}
              canGenerate={Boolean(canGenerate)}
              busy={busy === "generate" || busy === "bootstrap"}
              busyLabel={busy === "bootstrap" ? "正在准备账号..." : "正在创建任务..."}
              mvBusy={busy === "mv"}
              onGenerate={handleGenerate}
              onUsePrompt={setForm}
              onOpenTask={(task) => {
                void handleOpenTask(task);
              }}
              onOpenMvTask={(task) => {
                void handleOpenMvTask(task);
              }}
              onNotice={showMessage}
            />
          )}
          {activeTab === "generating" && <GeneratingPage task={currentTask} busy={busy === "generate"} onRetry={handleGenerate} />}
          {activeTab === "detail" && (
            <SongDetailPage
              title={selectedTitle}
              song={selectedSong}
              task={currentTask}
              audioUrl={selectedAudioUrl}
              lyrics={selectedLyrics}
              comments={selectedSong ? comments[selectedSong.id] ?? [] : []}
              commentDraft={commentDraft}
              setCommentDraft={setCommentDraft}
              busy={busy}
              onPublish={() => handlePublish(selectedSong?.id ?? currentTask?.songId)}
              onPlay={() => void handleTrackPlay(selectedSong?.id ?? currentTask?.songId)}
              onShare={() => selectedSong && setShareSong(selectedSong)}
              onOpenComments={() => selectedSong && void openComments(selectedSong)}
              onOpenCreator={(creatorId) => void openCreatorProfile(creatorId)}
              onPromote={() => selectedSong && handleOpenPromotion(selectedSong)}
              onJoinChallenge={() => selectedSong && handleOpenChallengeFromSong(selectedSong)}
              onComment={() => handleComment(selectedSong?.id)}
            />
          )}
          {activeTab === "gallery" && (
            <GalleryPage
              feed={marketplaceFeed}
              busy={busy === "feed"}
              currentUserId={session.userId}
              onRefresh={refreshFeed}
              onCreate={() => setActiveTab("home")}
              onOpen={openSong}
              onOpenComments={openComments}
              onShare={setShareSong}
              onOpenCreator={(creatorId) => void openCreatorProfile(creatorId)}
              onLike={handleToggleLike}
              onFavorite={handleToggleFavorite}
              onPlay={(song) => void handleTrackPlay(song.id)}
              onJoinChallenge={handleOpenChallengeFromSong}
              onAudioError={(song) => showMessage(`《${song.title}》音频暂时不可用，请稍后再试。`)}
            />
          )}
          {activeTab === "challenge" && (
            <ChallengePage
              creatorChallenge={creatorChallenge}
              songs={songs}
              fallbackSong={selectedSong?.userId === session.userId ? selectedSong : null}
              prefillSong={challengePrefillSong}
              userPlan={session.plan}
              busy={busy === "submitChallenge"}
              onRefresh={async () => {
                await Promise.all([refreshLibrary(), refreshChallenge(), refreshCreatorEconomy()]);
              }}
              onOpenRewards={() => setActiveTab("rewards")}
              onSubmit={handleJoinCreatorChallenge}
            />
          )}
          {activeTab === "rewards" && (
            <CreatorCenterPage
              rewards={rewards}
              stats={creatorStats}
              fund={creatorFund}
              growth={creatorGrowth}
              promotionOrders={promotionOrders}
              busy={busy === "claim"}
              onRefresh={async () => {
                await Promise.all([refreshRewards(), refreshCreatorEconomy()]);
              }}
              onClaim={handleClaimCreatorReward}
              onNotice={showMessage}
            />
          )}
          {activeTab === "search" && <DiscoverPage feed={marketplaceFeed} onOpen={openSong} onOpenCreator={(creatorId) => void openCreatorProfile(creatorId)} />}
          {activeTab === "profile" && (
            <ProfilePage
              session={session}
              stats={shellStats}
              songs={songs}
              rewards={rewards}
              tasks={tasks}
              likedSongs={likedSongs}
              favoriteSongs={favoriteSongs}
              apiBase={getApiBaseUrl()}
              onOpen={openSong}
              onOpenRewards={() => setActiveTab("rewards")}
              onOpenSettings={() => setSettingsOpen(true)}
              onRefresh={async () => {
                setBusy("library");
                try {
                  await Promise.all([refreshLibrary(), refreshRewards()]);
                  showMessage("个人数据已刷新。");
                } catch (unknown) {
                  showError(unknown);
                } finally {
                  setBusy(null);
                }
              }}
              onUseTestAccount={handleUseTestAccount}
              onResetIdentity={handleResetIdentity}
            />
          )}
        </main>

        {shareSong && (
          <ShareSheet
            song={shareSong}
            onClose={() => setShareSong(null)}
            onMessage={showMessage}
          />
        )}

        {commentSong && (
          <CommentsSheet
            song={commentSong}
            comments={comments[commentSong.id] ?? []}
            draft={commentDraft}
            busy={busy}
            setDraft={setCommentDraft}
            onClose={() => setCommentSong(null)}
            onSubmit={() => handleComment(commentSong.id)}
            onLike={(comment) => void handleToggleCommentLike(commentSong.id, comment)}
            onNotice={showMessage}
          />
        )}

        {creatorProfile && (
          <CreatorProfileSheet
            profile={creatorProfile}
            isSelf={creatorProfile.creator.id === session.userId}
            busy={busy === "follow"}
            onClose={() => setCreatorProfile(null)}
            onFollow={(next) => void handleToggleFollow(creatorProfile.creator.id, next)}
            onOpenSong={(song) => {
              setCreatorProfile(null);
              void openSong(song);
            }}
            onShare={(song) => setShareSong(song)}
            onNotice={showMessage}
          />
        )}

        {settingsOpen && (
          <SettingsSheet
            fontScale={fontScale}
            setFontScale={setFontScale}
            onClose={() => setSettingsOpen(false)}
            onResetIdentity={handleResetIdentity}
            onOpenRewards={() => {
              setSettingsOpen(false);
              setActiveTab("rewards");
            }}
            onNotice={showMessage}
          />
        )}

        {promotionSong && (
          <PromotionSheet
            song={promotionSong}
            packages={promotionPackages}
            busy={busy === "promotion"}
            onClose={() => setPromotionSong(null)}
            onConfirm={(pack) => void handleCreatePromotionOrder(pack)}
          />
        )}

        {profileOpen && (
          <ProfileDrawer
            session={session}
            stats={shellStats}
            songs={songs}
            tasks={tasks}
            apiBase={getApiBaseUrl()}
            onClose={() => setProfileOpen(false)}
            onOpenRewards={() => {
              setProfileOpen(false);
              setActiveTab("rewards");
            }}
            onOpenSettings={() => {
              setProfileOpen(false);
              setSettingsOpen(true);
            }}
            onOpen={(song) => {
              setProfileOpen(false);
              void openSong(song);
            }}
            onRefresh={async () => {
              setBusy("library");
              try {
                await refreshLibrary();
                showMessage("作品栏已刷新。");
              } catch (unknown) {
                showError(unknown);
              } finally {
                setBusy(null);
              }
            }}
            onUseTestAccount={handleUseTestAccount}
            onResetIdentity={handleResetIdentity}
          />
        )}

        <nav className="tabbar" aria-label="Primary">
          {tabs.map((tab) => (
            <button key={tab.id} className={activeTab === tab.id ? "active" : ""} type="button" onClick={() => void handleSelectTab(tab.id)}>
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </AuroraFrame>
  );
}

const RECOVERABLE_GENERATION_WINDOW_MS = 15 * 60 * 1000;

function findRecoverableGenerationTask(tasks: MusicTask[], form: GenerateMusicRequest): MusicTask | null {
  const now = Date.now();
  const theme = form.theme.trim();
  const expectedTitle = (form.title?.trim() || titleFromTheme(form.theme)).trim();
  const recoverableTasks = tasks.filter((task) => {
    if (task.status !== "queued" && task.status !== "generating" && task.status !== "succeeded") {
      return false;
    }

    const createdAt = new Date(task.createdAt).getTime();
    return !Number.isFinite(createdAt) || now - createdAt <= RECOVERABLE_GENERATION_WINDOW_MS;
  });

  return (
    recoverableTasks.find((task) => {
      const taskTitle = task.title?.trim() ?? "";
      const taskPrompt = (task.prompt || task.theme || "").trim();
      return (
        (expectedTitle && taskTitle === expectedTitle) ||
        (theme.length >= 4 && Boolean(taskPrompt) && (taskPrompt.includes(theme) || theme.includes(taskPrompt)))
      );
    }) ??
    recoverableTasks[0] ??
    null
  );
}

function HomePage({
  form,
  setForm,
  tasks,
  mvTasks,
  canGenerate,
  busy,
  busyLabel,
  mvBusy,
  onGenerate,
  onUsePrompt,
  onOpenTask,
  onOpenMvTask,
  onNotice
}: {
  form: GenerateMusicRequest;
  setForm: (form: GenerateMusicRequest) => void;
  tasks: MusicTask[];
  mvTasks: MvTask[];
  canGenerate: boolean;
  busy: boolean;
  busyLabel: string;
  mvBusy: boolean;
  onGenerate: (event?: FormEvent, mvDraft?: PendingMvDraft | null) => void;
  onUsePrompt: (form: GenerateMusicRequest) => void;
  onOpenTask: (task: MusicTask) => void;
  onOpenMvTask: (task: MvTask) => void;
  onNotice: (message: string) => void;
}) {
  const keywords = extractKeywords(form.theme || form.lyrics || "希望 自由 雨后");
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [mvEnabled, setMvEnabled] = useState(false);
  const [mvPrompt, setMvPrompt] = useState("");
  const [mvFileCount, setMvFileCount] = useState(0);
  const [mvImageNames, setMvImageNames] = useState<string[]>([]);

  function handleSubmit(event: FormEvent) {
    const activeMvEnabled = MV_FEATURE_ENABLED && mvEnabled;
    if (activeMvEnabled) {
      const promptHint = mvPrompt.trim() ? "MV 描述已保存。" : "你也可以稍后补充 MV 描述。";
      onNotice(`已开启 MV AI：歌曲完成后会带上 ${mvFileCount} 张照片和 MV 方案进入制作流程。${promptHint}`);
    }
    onGenerate(event, activeMvEnabled ? { enabled: true, prompt: mvPrompt.trim(), imageCount: mvFileCount, imageNames: mvImageNames } : null);
  }

  return (
    <section className="page home-page">
      <div className="hero-card glass-card">
        <div>
          <p className="gold-label">AI 音乐工作室</p>
          <h1>把一句灵感变成一首歌</h1>
          <p>让 AI 为你的情绪谱曲，在绿色声波极光里完成第一段旋律。</p>
        </div>
        <div className="hero-wave" aria-hidden="true">
          {Array.from({ length: 11 }).map((_, index) => (
            <i key={index} style={{ animationDelay: `${index * 80}ms` }} />
          ))}
        </div>
      </div>

      <form className="generator glass-card" onSubmit={handleSubmit}>
        <div className="section-heading">
          <h2>大型灵感输入器</h2>
          <span>{form.theme.length}/240</span>
        </div>
        <label className="input-label">
          灵感
          <textarea
            value={form.theme}
            maxLength={240}
            onChange={(event) => setForm({ ...form, theme: event.target.value })}
            placeholder="例如：雨后植物园重新亮起来，像一段温柔但有生命力的 Art Pop。"
          />
        </label>
        <div className="detected-box">
          <span>检测到情绪</span>
          <div>
            {keywords.map((keyword) => (
              <em key={keyword}>{keyword}</em>
            ))}
          </div>
        </div>
        <label className="input-label">
          作品标题
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：森林来信" />
        </label>
        <ControlGroup label="风格" compact>
          {styleOptions.map((style) => (
            <button key={style} className={`glass-pill ${form.style === style ? "selected" : ""}`} type="button" onClick={() => setForm({ ...form, style })}>
              {style}
            </button>
          ))}
        </ControlGroup>
        <ControlGroup label="情绪" compact>
          {moodOptions.map((mood) => (
            <button key={mood} className={`glass-pill ${form.mood === mood ? "selected" : ""}`} type="button" onClick={() => setForm({ ...form, mood })}>
              {mood}
            </button>
          ))}
        </ControlGroup>
        <div className="mode-row">
          <button className={form.mode === "vocal" ? "selected" : ""} type="button" onClick={() => setForm({ ...form, mode: "vocal" })}>
            人声歌曲
          </button>
          <button className={form.mode === "instrumental" ? "selected" : ""} type="button" onClick={() => setForm({ ...form, mode: "instrumental" })}>
            纯音乐
          </button>
        </div>
        <div className="quick-generate-block">
          <div className="cost-strip">
            <span>本次生成</span>
            <strong>{MV_FEATURE_ENABLED && mvEnabled ? "歌曲不限次数 · MV 测试开放" : "测试期不限次数"}</strong>
            <button type="button" onClick={() => setMoreOptionsOpen(!moreOptionsOpen)}>
              {moreOptionsOpen ? "收起选项" : "更多选项"}
            </button>
          </div>
          <button className="liquid-button" type="submit" disabled={!canGenerate || busy}>
            {busy ? busyLabel : MV_FEATURE_ENABLED && mvEnabled ? "生成歌曲 + 准备 MV" : "生成歌曲"}
          </button>
        </div>
        {moreOptionsOpen && (
          <div className="advanced-options">
            <button type="button" className={form.lyricsOptimizer ? "selected" : ""} onClick={() => setForm({ ...form, lyricsOptimizer: !form.lyricsOptimizer })}>
              歌词智能优化
            </button>
            <button type="button" onClick={() => onNotice("版权检测已内置：当前版本禁止上传参考音乐，后续会开放更完整的授权检测报告。")}>
              版权检测 · 禁止参考侵权音乐
            </button>
          </div>
        )}
        {form.mode === "vocal" && (
          <label className="input-label">
            歌词
            <textarea
              className="lyrics-box"
              value={form.lyrics}
              onChange={(event) => setForm({ ...form, lyrics: event.target.value })}
              placeholder="可选：不填时后端会让 MiniMax 优化歌词。"
            />
          </label>
        )}
        {MV_FEATURE_ENABLED && (
          <section className={`mv-panel mv-creator ${mvEnabled ? "enabled" : ""}`} aria-label="MV AI">
            <div className="mv-head">
              <div>
                <p className="gold-label">MV AI</p>
                <h2>同时准备音乐 MV</h2>
                <p>上传照片、写视觉提示词，歌曲生成后即可继续制作 MV。</p>
              </div>
              <button className={mvEnabled ? "selected" : ""} type="button" onClick={() => setMvEnabled(!mvEnabled)}>
                {mvEnabled ? "已开启" : "开启"}
              </button>
            </div>
            <div className="mv-cost-row">
              <span>MV 制作</span>
              <strong>{mvEnabled ? "测试期开放" : "可选 · 不消耗"}</strong>
            </div>
            {mvEnabled && (
              <div className="mv-fields">
                <label className="upload-tile">
                  {mvFileCount > 0 ? `已选择 ${mvFileCount} 张照片` : "上传照片 / 角色图"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      setMvFileCount(files.length);
                      setMvImageNames(files.map((file) => file.name));
                    }}
                  />
                </label>
                <label className="input-label">
                  MV 描述 <span>{mvPrompt.length}/1500</span>
                  <textarea
                    value={mvPrompt}
                    onChange={(event) => setMvPrompt(event.target.value)}
                    maxLength={1500}
                    placeholder="例如：绿色极光舞台、慢镜头、雨后玻璃质感、主角走进美术馆，镜头跟随节拍轻轻推进。"
                  />
                </label>
                <div className="mv-tip-grid">
                  <span>歌曲生成后制作</span>
                  <span>照片驱动视觉</span>
                  <span>适合短视频发布</span>
                </div>
              </div>
            )}
          </section>
        )}
      </form>

      <section className="template-list glass-card">
        <div className="section-heading">
          <h2>灵感模板</h2>
          <span>30 秒开始</span>
        </div>
        <div className="template-grid">
          {starterPrompts.map((prompt) => (
            <button key={prompt.title} type="button" onClick={() => onUsePrompt(prompt)}>
              <strong>{prompt.title}</strong>
              <span>{prompt.theme}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="task-list glass-card">
        <div className="section-heading">
          <h2>最近任务</h2>
          <span>{tasks.length} 个</span>
        </div>
        {tasks.length === 0 ? (
          <EmptyState title="还没有生成任务" body="写一句灵感并点击生成，结果会自动保存到作品栏。" />
        ) : (
          tasks.slice(0, 5).map((task) => (
            <button className="row-button" type="button" key={task.id} onClick={() => onOpenTask(task)}>
              <span>
                <strong>{task.title || titleFromTheme(task.prompt)}</strong>
                <small>{task.style} · {formatDate(task.createdAt)}</small>
              </span>
              <StatusPill status={task.status} />
            </button>
          ))
        )}
      </section>

      {MV_FEATURE_ENABLED && (
        <section className="task-list mv-task-list glass-card">
          <div className="section-heading">
            <h2>MV 制作进度</h2>
            <span>{mvTasks.length} 个</span>
          </div>
          {mvTasks.length === 0 ? (
            <EmptyState title="还没有 MV 任务" body="开启 MV AI 后，歌曲完成会自动创建 MV 制作任务。" />
          ) : (
            mvTasks.slice(0, 4).map((task) => (
              <button className="row-button mv-row-button" type="button" key={task.id} onClick={() => onOpenMvTask(task)} disabled={mvBusy}>
                <span>
                  <strong>{task.songTitle || "音乐 MV"}</strong>
                  <small>{task.imageCount} 张照片 · {formatDate(task.createdAt)}</small>
                </span>
                <StatusPill status={task.status} />
              </button>
            ))
          )}
        </section>
      )}
    </section>
  );
}

function GeneratingPage({ task, busy, onRetry }: { task: MusicTask | null; busy: boolean; onRetry: () => void }) {
  const statusText = task ? statusLabel(task.status) : busy ? "创建任务中" : "等待开始";
  return (
    <section className="page generating-page">
      <div className="generating-card glass-card">
        <div className="vinyl">
          <span />
        </div>
        <h1>{statusText}</h1>
        <p>{task?.status === "failed" ? friendlyTaskError(task) : "正在排队与生成，保持页面打开即可自动更新。"}</p>
        <div className="large-wave" aria-hidden="true">
          {Array.from({ length: 13 }).map((_, index) => (
            <i key={index} style={{ animationDelay: `${index * 70}ms` }} />
          ))}
        </div>
        <div className="lyric-float">
          <strong>{task?.title || "灵感正在进入声波轨道"}</strong>
          <span>{task?.style || "Green Sonic Gallery"}</span>
        </div>
        {task?.status === "failed" && (
          <button className="liquid-button" type="button" onClick={onRetry}>
            重新生成
          </button>
        )}
      </div>
    </section>
  );
}

function SongDetailPage({
  title,
  song,
  task,
  audioUrl,
  lyrics,
  comments,
  commentDraft,
  setCommentDraft,
  busy,
  onPublish,
  onPlay,
  onShare,
  onOpenComments,
  onOpenCreator,
  onPromote,
  onJoinChallenge,
  onComment
}: {
  title: string;
  song: Song | null;
  task: MusicTask | null;
  audioUrl: string | null;
  lyrics: string | null;
  comments: Comment[];
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  busy: BusyKey;
  onPublish: () => void;
  onPlay: () => void;
  onShare: () => void;
  onOpenComments: () => void;
  onOpenCreator: (creatorId: string) => void;
  onPromote: () => void;
  onJoinChallenge: () => void;
  onComment: () => void;
}) {
  return (
    <section className="page detail-page">
      <div className="detail-card glass-card">
        <CoverArt title={title} coverUrl={song?.coverUrl ?? task?.coverUrl ?? null} />
        <div className="detail-info">
          <p className="gold-label">{song?.style ?? task?.style ?? "Green Sonic"}</p>
          <h1>{title}</h1>
          <p>{song?.theme ?? task?.prompt ?? "选择一首作品查看详情。"}</p>
          {song && (
            <div className="song-stats detail-stats" aria-label="作品数据">
              <span>{song.visibility === "public" ? "已公开" : "私密"}</span>
              <span>{song.viewCount ?? 0} 浏览</span>
              <span>{song.playCount ?? 0} 播放</span>
              <span>{song.commentsCount ?? 0} 评论</span>
            </div>
          )}
          {audioUrl ? <audio controls src={audioUrl} onPlay={onPlay} /> : <EmptyState title="暂无音频" body="生成成功后会自动出现播放器。" />}
          <div className="action-row">
            <button className="liquid-button compact" type="button" onClick={onPublish} disabled={busy === "publish" || !song?.id || song?.visibility === "public"}>
              {song?.visibility === "public" ? "已发布" : busy === "publish" ? "发布中..." : "发布到广场"}
            </button>
            {song && (
              <button className="ghost-button" type="button" onClick={() => onOpenCreator(song.userId)}>
                创作者
              </button>
            )}
            <button className="ghost-button" type="button" onClick={onOpenComments} disabled={!song?.id}>
              评论
            </button>
            <button className="ghost-button" type="button" onClick={onShare} disabled={!audioUrl || !song?.id}>
              分享
            </button>
            <button className="ghost-button" type="button" onClick={onPromote} disabled={!song?.id}>
              推广
            </button>
            <button className="ghost-button" type="button" onClick={onJoinChallenge} disabled={!song?.id}>
              参加挑战
            </button>
            {audioUrl && (
              <a className="ghost-button" href={audioUrl} download={`${title}.mp3`}>
                下载
              </a>
            )}
          </div>
        </div>
      </div>

      <section className="glass-card">
        <div className="section-heading">
          <h2>歌词</h2>
          <span>{song?.mode ?? task?.mode ?? "vocal"}</span>
        </div>
        <p className="lyrics-text">{lyrics || "纯音乐作品暂无歌词。"}</p>
      </section>

      {song && (
        <section className="glass-card">
          <div className="section-heading">
            <h2>评论</h2>
            <span>{comments.length}</span>
          </div>
          <form
            className="comment-box"
            onSubmit={(event) => {
              event.preventDefault();
              onComment();
            }}
          >
            <input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="写一句反馈..." />
            <button type="submit" disabled={Boolean(busy) || !commentDraft.trim()}>
              {busy === "comment" ? "发送中..." : "发送"}
            </button>
          </form>
          <div className="comment-list">
            {comments.length === 0 ? (
              <EmptyState title="还没有评论" body="发布到广场后，用户反馈会出现在这里。" />
            ) : (
              comments.map((comment) => (
                <article key={comment.id}>
                  <strong>{displayNameLabel(comment.userName)}</strong>
                  <p>{comment.body}</p>
                  <small>{formatDate(comment.createdAt)}</small>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </section>
  );
}

function GalleryPage({
  feed,
  busy,
  currentUserId,
  onRefresh,
  onCreate,
  onOpen,
  onOpenComments,
  onShare,
  onOpenCreator,
  onLike,
  onFavorite,
  onPlay,
  onJoinChallenge,
  onAudioError
}: {
  feed: FeedItem[];
  busy: boolean;
  currentUserId: string;
  onRefresh: () => Promise<void>;
  onCreate: () => void;
  onOpen: (song: FeedItem) => void;
  onOpenComments: (song: FeedItem) => void;
  onShare: (song: FeedItem) => void;
  onOpenCreator: (creatorId: string) => void;
  onLike: (song: FeedItem) => void;
  onFavorite: (song: FeedItem) => void;
  onPlay: (song: FeedItem) => void;
  onJoinChallenge: (song: FeedItem) => void;
  onAudioError: (song: FeedItem) => void;
}) {
  const sections = [
    { title: "今日热门", body: "真实播放和收藏正在上升的 AI 歌曲。", songs: feed.filter((song, index) => (song as MarketplaceSong).lane === "hot" || index < 2) },
    { title: "新人新歌", body: "刚发布的新作品，适合抢先评论和收藏。", songs: feed.filter((song) => (song as MarketplaceSong).lane === "new") },
    { title: "挑战赛作品", body: "正在参加本周主题赛的公开作品。", songs: feed.filter((song) => (song as MarketplaceSong).lane === "challenge") },
    { title: "推荐给你", body: "根据风格和互动表现进入推荐池。", songs: feed.filter((song) => (song as MarketplaceSong).lane === "recommended") }
  ].filter((section) => section.songs.length > 0);

  return (
    <section className="page gallery-page marketplace-page">
      <div className="page-title-row marketplace-title">
        <div>
          <p className="gold-label">Green Sonic Marketplace</p>
          <h1>音乐广场</h1>
          <p>发现 AI 音乐创作者的新作品，播放、收藏、评论都会影响创作者积分预估。</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => void onRefresh()} disabled={busy}>
          {busy ? "刷新中" : "刷新"}
        </button>
      </div>
      {feed.length === 0 ? (
        <section className="empty-gallery glass-card">
          <div className="empty-record">
            <span />
          </div>
          <div>
            <p className="gold-label">发布第一首作品</p>
            <h1>还没有公开作品</h1>
            <p>先创作一首歌，发布后会进入音乐广场；也可以刷新看看其他创作者的新作品。</p>
          </div>
          <div className="empty-actions">
            <button className="liquid-button compact" type="button" onClick={onCreate}>
              去创作
            </button>
            <button className="ghost-button" type="button" onClick={() => void onRefresh()} disabled={busy}>
              {busy ? "刷新中" : "刷新广场"}
            </button>
          </div>
        </section>
      ) : (
        <div className="marketplace-sections">
          {sections.map((section) => (
            <section className="marketplace-section glass-card" key={section.title}>
              <div className="section-heading">
                <div>
                  <h2>{section.title}</h2>
                  <p>{section.body}</p>
                </div>
                <span>{section.songs.length} 首</span>
              </div>
              <div className="marketplace-grid">
                {section.songs.map((song) => (
                  <MarketplaceCard
                    key={song.id}
                    song={song}
                    currentUserId={currentUserId}
                    onOpen={onOpen}
                    onOpenComments={onOpenComments}
                    onShare={onShare}
                    onOpenCreator={onOpenCreator}
                    onLike={onLike}
                    onFavorite={onFavorite}
                    onPlay={onPlay}
                    onJoinChallenge={onJoinChallenge}
                    onAudioError={onAudioError}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function MarketplaceCard({
  song,
  currentUserId,
  onOpen,
  onOpenComments,
  onShare,
  onOpenCreator,
  onLike,
  onFavorite,
  onPlay,
  onJoinChallenge,
  onAudioError
}: {
  song: FeedItem;
  currentUserId: string;
  onOpen: (song: FeedItem) => void;
  onOpenComments: (song: FeedItem) => void;
  onShare: (song: FeedItem) => void;
  onOpenCreator: (creatorId: string) => void;
  onLike: (song: FeedItem) => void;
  onFavorite: (song: FeedItem) => void;
  onPlay: (song: FeedItem) => void;
  onJoinChallenge: (song: FeedItem) => void;
  onAudioError: (song: FeedItem) => void;
}) {
  const creatorPoints = "creatorPoints" in song
    ? Number((song as MarketplaceSong).creatorPoints)
    : Math.max(0, Math.round((song.playCount ?? 0) * 0.18 + song.likesCount * 4 + song.commentsCount * 5));

  return (
    <article className="marketplace-card">
      <div className="marketplace-cover-shell">
        <button className="marketplace-cover" type="button" onClick={() => onOpen(song)}>
          <CoverArt title={song.title} coverUrl={song.coverUrl} />
          <span>播放</span>
        </button>
        <div className="cover-social-actions" aria-label="作品快捷互动">
          <button
            className={`cover-social like ${song.likedByMe ? "active" : ""}`}
            type="button"
            onClick={() => onLike(song)}
            aria-label={song.likedByMe ? "取消喜欢" : "喜欢这首歌"}
          >
            <span>♥</span>
            <small>{formatCompact(song.likesCount)}</small>
          </button>
          <button
            className="cover-social comment"
            type="button"
            onClick={() => onOpenComments(song)}
            aria-label="查看评论"
          >
            <span>◌</span>
            <small>{formatCompact(song.commentsCount)}</small>
          </button>
          <button
            className={`cover-social favorite ${song.favoritedByMe ? "active" : ""}`}
            type="button"
            onClick={() => onFavorite(song)}
            aria-label={song.favoritedByMe ? "取消收藏" : "收藏这首歌"}
          >
            <span>★</span>
            <small>{song.favoritedByMe ? "已收藏" : "收藏"}</small>
          </button>
          <button
            className="cover-social share"
            type="button"
            onClick={() => onShare(song)}
            aria-label="分享歌曲"
          >
            <span>↗</span>
            <small>分享</small>
          </button>
        </div>
      </div>
      <div className="marketplace-card-body">
        <button className="creator-chip" type="button" onClick={() => onOpenCreator(song.userId)}>
          <span>{displayInitial(song.creatorName)}</span>
          <strong>{displayNameLabel(song.creatorName)}</strong>
          <em>{song.userId === currentUserId ? "本人" : "关注"}</em>
        </button>
        <h3>{song.title}</h3>
        <p>{song.theme}</p>
        <div className="song-stats">
          <span>{song.style}</span>
          <span>{formatCompact(song.playCount ?? 0)} 播放</span>
          <span>{formatCompact(song.likesCount)} 点赞</span>
          <span>{formatPoints(creatorPoints)} 积分</span>
        </div>
        <div className="marketplace-player-strip">
          <button className="marketplace-play-button" type="button" onClick={() => onOpen(song)}>
            <span>▶</span>
            播放详情
          </button>
          <audio controls src={song.audioUrl} onPlay={() => onPlay(song)} onError={() => onAudioError(song)} />
        </div>
        <div className="marketplace-card-footer">
          <button className="challenge-chip" type="button" onClick={() => onJoinChallenge(song)}>
            参加挑战
          </button>
        </div>
      </div>
    </article>
  );
}

function ChallengePage({
  creatorChallenge,
  songs,
  fallbackSong,
  prefillSong,
  userPlan,
  busy,
  onRefresh,
  onOpenRewards,
  onSubmit
}: {
  creatorChallenge: CreatorChallenge | null;
  songs: Song[];
  fallbackSong: Song | null;
  prefillSong: Song | FeedItem | null;
  userPlan: Plan;
  busy: boolean;
  onRefresh: () => Promise<void>;
  onOpenRewards: () => void;
  onSubmit: (songId: string) => void;
}) {
  const [songId, setSongId] = useState("");
  const candidateSongs = useMemo(() => mergeSongCandidates(songs, fallbackSong), [fallbackSong, songs]);
  const rewardPlan: Plan = "creator";
  const needsHigherPlanForRewards = !planMeets(userPlan, rewardPlan);

  useEffect(() => {
    if (songId && candidateSongs.some((song) => song.id === songId)) {
      return;
    }
    if (candidateSongs[0]) {
      setSongId(candidateSongs[0].id);
    }
  }, [candidateSongs, songId]);

  return (
    <section className="page challenge-page">
      <div className="challenge-banner glass-card">
        <p className="gold-label">挑战赛中心</p>
        <h1>{creatorChallenge?.title ?? "本周AI音乐挑战赛"}</h1>
        <p>主题：{creatorChallenge?.theme ?? "雨后的植物园"}</p>
        <div className="challenge-meta">
          <span>奖金池：{creatorChallenge?.prizePoolUsdc ?? 500} USDC</span>
          <span>截止时间：{creatorChallenge?.endsIn ?? "3天12小时"}</span>
          <span>参赛作品：{formatCompact(creatorChallenge?.submissionCount ?? 1284)} 首</span>
          <span>{planLabel(rewardPlan)}奖励资格</span>
        </div>
        {needsHigherPlanForRewards ? (
          <p className="challenge-note">
            你现在是{planLabel(userPlan)}，可以先投稿参与排行；奖金池结算和 USDC 创作者基金分配需要{planLabel(rewardPlan)}资格。
            <button type="button" onClick={onOpenRewards}>查看会员</button>
          </p>
        ) : null}
      </div>
      <section className="glass-card challenge-rules-card">
        <div className="section-heading">
          <h2>奖励规则</h2>
          <span>真实互动排名</span>
        </div>
        <div className="reward-rule-grid">
          {(creatorChallenge?.rewards ?? []).map((item) => (
            <div key={item.rank}>
              <span>{item.rank}</span>
              <strong>{item.reward}</strong>
            </div>
          ))}
        </div>
        <p>排名综合真实播放、完播率、点赞、收藏、评论计算，异常播放不会计入最终排名。</p>
      </section>
      <section className="glass-card">
        <div className="section-heading">
          <div>
            <h2>选择作品参赛</h2>
            {prefillSong && <p>你刚从《{prefillSong.title}》进入挑战赛；只能选择自己的作品正式投稿。</p>}
          </div>
          <button className="ghost-inline" type="button" onClick={() => void onRefresh()}>
            刷新挑战
          </button>
        </div>
        {candidateSongs.length === 0 ? (
          <EmptyState title="暂无可投稿作品" body="先生成一首歌，发布后再参加本周 AI 音乐挑战赛。" />
        ) : (
          <div className="submit-row">
            <select value={songId} onChange={(event) => setSongId(event.target.value)}>
              {candidateSongs.map((song) => (
                <option value={song.id} key={song.id}>
                  {song.title}{song.visibility === "public" ? " · 已公开" : ""}
                </option>
              ))}
            </select>
            <button className="liquid-button compact" type="button" onClick={() => onSubmit(songId)} disabled={busy || !songId || !creatorChallenge?.id}>
              {busy ? "投稿中..." : "选择作品参赛"}
            </button>
          </div>
        )}
      </section>
      <section className="glass-card">
        <div className="section-heading">
          <h2>排行榜</h2>
          <span>{creatorChallenge?.submissionCount ?? 0} 投稿</span>
        </div>
        {(creatorChallenge?.leaderboard ?? []).length === 0 ? (
          <EmptyState title="排行榜等待首个作品" body="提交作品后会出现在赛事排名里。" />
        ) : (
          creatorChallenge?.leaderboard.map((entry) => (
            <div className="leader-row challenge-leader-row" key={`${entry.rank}-${entry.songId}`}>
              <strong>#{entry.rank}</strong>
              <CoverArt title={entry.title} coverUrl={entry.coverUrl} />
              <span>{entry.title}</span>
              <em>{displayNameLabel(entry.creatorName)}</em>
              <small>{formatCompact(entry.playCount)} 播放 · {formatCompact(entry.likesCount)} 点赞</small>
              <b>{formatPoints(entry.creatorPoints)}</b>
            </div>
          ))
        )}
      </section>
      <section className="glass-card">
        <div className="section-heading">
          <h2>参赛规则</h2>
          <span>风控审核</span>
        </div>
        <ul className="challenge-rule-list">
          {(creatorChallenge?.rules ?? [
            "禁止刷量，异常播放不计入排名。",
            "排名综合真实播放、完播率、点赞、收藏、评论计算。"
          ]).map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function CreatorCenterPage({
  rewards,
  stats,
  fund,
  growth,
  promotionOrders,
  busy,
  onRefresh,
  onClaim,
  onNotice
}: {
  rewards: RewardHistory;
  stats: CreatorStats | null;
  fund: CreatorFund | null;
  growth: GrowthPoint[];
  promotionOrders: PromotionOrder[];
  busy: boolean;
  onRefresh: () => Promise<void>;
  onClaim: () => void;
  onNotice: (message: string) => void;
}) {
  const settlementLabel: Record<SettlementStatus, string> = {
    pending: "待结算",
    available: "可申请",
    reviewing: "审核中",
    paid: "已发放"
  };
  const currentStats = stats ?? {
    monthImpressions: 0,
    monthPlays: 0,
    engagementCount: 0,
    creatorPoints: rewards.balance,
    estimatedUsdcRange: "待预估",
    settlementStatus: "pending" as SettlementStatus
  };
  const maxGrowth = Math.max(1, ...growth.map((item) => item.impressions));

  return (
    <section className="page creator-center-page rewards-page">
      <div className="creator-center-hero glass-card">
        <div>
          <p className="gold-label">Creator Center</p>
          <h1>创作者中心</h1>
          <p>用 AI 创作音乐，获得真实听众与创作者奖励。数据会根据播放、互动质量和风控审核持续浮动。</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => void onRefresh()}>
          刷新
        </button>
      </div>
      <div className="metric-grid creator-metric-grid">
        <Metric label="本月曝光" value={formatCompact(currentStats.monthImpressions)} />
        <Metric label="本月真实播放" value={formatCompact(currentStats.monthPlays)} />
        <Metric label="点赞收藏" value={formatCompact(currentStats.engagementCount)} />
        <Metric label="创作者积分" value={formatPoints(currentStats.creatorPoints)} />
        <Metric label="预计USDC奖励" value={currentStats.estimatedUsdcRange} />
        <Metric label="累计积分" value={formatPoints(rewards.lifetimeEarned)} />
      </div>
      <section className="creator-fund-card glass-card">
        <div className="section-heading">
          <h2>创作者基金池</h2>
          <span>本月预估</span>
        </div>
        <div className="fund-stat-grid">
          <div>
            <span>本月创作者基金池</span>
            <strong>{formatCompact(fund?.poolUsdc ?? 12500)} USDC</strong>
          </div>
          <div>
            <span>全站积分</span>
            <strong>{formatCompact(fund?.totalPlatformPoints ?? 1280000)}</strong>
          </div>
          <div>
            <span>我的积分</span>
            <strong>{formatPoints(fund?.myPoints ?? currentStats.creatorPoints)}</strong>
          </div>
          <div>
            <span>预计分成</span>
            <strong>{fund?.estimatedShareRange ?? `${currentStats.estimatedUsdcRange} USDC`}</strong>
          </div>
        </div>
        <p className="subtle-note">{fund?.settlementNote ?? "最终奖励根据月底全站积分占比结算。"}</p>
      </section>
      <section className="growth-card glass-card">
        <div className="section-heading">
          <h2>成长曲线</h2>
          <span>曝光 / 播放 / 积分</span>
        </div>
        <div className="growth-chart">
          {growth.map((item) => (
            <div key={item.label}>
              <span style={{ height: `${Math.max(14, (item.impressions / maxGrowth) * 100)}%` }} />
              <em>{item.label}</em>
              <small>{formatCompact(item.plays)} 播放</small>
            </div>
          ))}
        </div>
      </section>
      <section className="settlement-card glass-card">
        <div className="section-heading">
          <h2>USDC 创作者结算</h2>
          <span>{settlementLabel[currentStats.settlementStatus]}</span>
        </div>
        <p>申请USDC结算会在本月结算后开放。最终金额按真实互动质量、月底积分占比和风控审核结果确定。</p>
        <button className="liquid-button" type="button" disabled={busy} onClick={onClaim}>
          {busy ? "处理中..." : "申请USDC结算"}
        </button>
      </section>
      <section className="glass-card">
        <div className="section-heading">
          <h2>推广加速记录</h2>
          <span>{promotionOrders.length}</span>
        </div>
        {promotionOrders.length === 0 ? (
          <EmptyState title="暂无推广申请" body="在作品详情或音乐广场点击“推广”，可以为作品申请推荐曝光。" />
        ) : (
          promotionOrders.map((item) => (
            <div className="ledger-row" key={item.id}>
              <span>
                <strong>{item.packageId}</strong>
                <small>{formatDate(item.createdAt)} · 推荐队列审核中</small>
              </span>
              <b>曝光</b>
            </div>
          ))
        )}
      </section>
      <section className="glass-card">
        <div className="section-heading">
          <h2>积分记录</h2>
          <span>{rewards.ledger.length}</span>
        </div>
        {rewards.ledger.length === 0 ? (
          <EmptyState title="暂无积分记录" body="发布作品、参加挑战、获得真实互动后会产生积分记录。" />
        ) : (
          rewards.ledger.slice(0, 8).map((entry) => (
            <div className="ledger-row" key={entry.id}>
              <span>
                <strong>{entry.source}</strong>
                <small>{formatDate(entry.createdAt)} · {entry.status}</small>
              </span>
              <b>{entry.delta > 0 ? "+" : ""}{entry.delta}</b>
            </div>
          ))
        )}
        <button className="ghost-button full" type="button" onClick={() => onNotice("后台会按月结算创作者基金，当前页面展示的是前端 mock 预估。")}>
          查看结算说明
        </button>
      </section>
    </section>
  );
}

function PromotionSheet({
  song,
  packages,
  busy,
  onClose,
  onConfirm
}: {
  song: Song | FeedItem;
  packages: PromotionPackage[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (pack: PromotionPackage) => void;
}) {
  const [confirmPack, setConfirmPack] = useState<PromotionPackage | null>(null);
  const creatorPoints = "creatorPoints" in song
    ? Number((song as MarketplaceSong).creatorPoints)
    : Math.max(0, Math.round((song.playCount ?? 0) * 0.18 + song.likesCount * 4 + song.commentsCount * 5));

  return (
    <div className="sheet-backdrop promotion-backdrop" role="dialog" aria-modal="true" aria-label="作品推广">
      <section className="promotion-sheet glass-card">
        <button className="icon-button sheet-close" type="button" onClick={onClose} aria-label="关闭推广">
          ×
        </button>
        <div className="sheet-handle" />
        <div className="promotion-song-card">
          <CoverArt title={song.title} coverUrl={song.coverUrl} />
          <div>
            <p className="gold-label">作品推广</p>
            <h2>{song.title}</h2>
            <p>{song.style} · {formatCompact(song.playCount ?? 0)} 播放 · {formatCompact(song.likesCount)} 点赞 · {formatPoints(creatorPoints)} 积分</p>
          </div>
        </div>
        <section className="promotion-note">
          <strong>推广增加的是推荐曝光，不保证播放和收益。</strong>
          <p>实际播放取决于作品质量、封面、标题和用户互动。平台只按真实播放、互动质量和风控结果计算积分。</p>
        </section>
        <div className="promotion-packages">
          {packages.map((promoPack) => (
            <article className={`promotion-package ${promoPack.tone}`} key={promoPack.id}>
              <div>
                <span>{promoPack.name}</span>
                <strong>{promoPack.priceUsdc}</strong>
              </div>
              <p>预计曝光：{promoPack.estimatedExposure}</p>
              <small>适合：{promoPack.bestFor}{promoPack.reviewRequired ? " · 需要人工审核" : ""}</small>
              <button className="liquid-button compact" type="button" onClick={() => setConfirmPack(promoPack)}>
                立即加速
              </button>
            </article>
          ))}
        </div>
        <p className="promotion-risk">推广不会直接产生 USDC，平台只按真实播放、互动质量、风控结果计算积分。</p>
      </section>
      {confirmPack && (
        <div className="promotion-confirm" role="dialog" aria-modal="true" aria-label="确认推广">
          <section className="glass-card">
            <h2>确认推广申请</h2>
            <p>你将为《{song.title}》申请「{confirmPack.name}」。这会增加推荐曝光机会，但不保证播放、积分或 USDC 奖励。</p>
            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={() => setConfirmPack(null)} disabled={busy}>
                取消
              </button>
              <button className="liquid-button compact" type="button" onClick={() => onConfirm(confirmPack)} disabled={busy}>
                {busy ? "提交中..." : "确认加速"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ProfileDrawer({
  session,
  stats,
  songs,
  tasks,
  apiBase,
  onClose,
  onOpenRewards,
  onOpenSettings,
  onOpen,
  onRefresh,
  onUseTestAccount,
  onResetIdentity
}: {
  session: ApiSession;
  stats: Array<{ label: string; value: number }>;
  songs: Song[];
  tasks: MusicTask[];
  apiBase: string;
  onClose: () => void;
  onOpenRewards: () => void;
  onOpenSettings: () => void;
  onOpen: (song: Song) => void;
  onRefresh: () => Promise<void>;
  onUseTestAccount: () => void;
  onResetIdentity: () => void;
}) {
  const publicCount = songs.filter((song) => song.visibility === "public").length;

  return (
    <div className="profile-drawer-backdrop" role="dialog" aria-modal="true" aria-label="个人中心">
      <aside className="profile-drawer glass-card">
        <div className="drawer-head">
          <div className="profile-hero compact-profile">
            <div className="profile-avatar">{displayInitial(session.displayName)}</div>
            <div>
              <h1>{displayNameLabel(session.displayName)}</h1>
              <p>{session.email ?? "本机创作者身份"} · {planLabel(session.plan)}</p>
            </div>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭个人中心">
            ×
          </button>
        </div>

        <div className="drawer-metrics">
          {stats.map((stat) => (
            <div key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>

        <section className="drawer-section membership-panel">
          <div>
            <p className="gold-label">会员权益</p>
            <h2>会员套餐</h2>
            <p>当前是 {planLabel(session.plan)}，可继续测试生成、发布和奖励流程。</p>
          </div>
          <div className="plan-row">
            <span>免费版 · 试听</span>
            <span>专业版 · 100 首/月</span>
            <span>创作者版 · 挑战奖励</span>
          </div>
          <button className="ghost-button full" type="button" onClick={onOpenRewards}>
            查看创作者奖励
          </button>
          <button className="ghost-button full" type="button" onClick={onOpenSettings}>
            打开设置
          </button>
        </section>

        <section className="drawer-section">
          <div className="section-heading">
            <h2>我的作品</h2>
            <button className="ghost-inline" type="button" onClick={() => void onRefresh()}>
              刷新
            </button>
          </div>
          {songs.length === 0 ? (
            <EmptyState title="作品栏为空" body="生成成功后的歌曲会自动保存到这里。" />
          ) : (
            <div className="drawer-work-list">
              {songs.slice(0, 8).map((song) => (
                <button key={song.id} type="button" onClick={() => onOpen(song)}>
                  <CoverArt title={song.title} coverUrl={song.coverUrl} />
                  <span>
                    <strong>{song.title}</strong>
                    <small>{song.visibility === "public" ? "公开" : "私密"} · {song.style} · {song.playCount ?? 0} 播放</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="drawer-section account-panel">
          <div className="section-heading">
            <h2>账号</h2>
            <span>{publicCount} 首公开</span>
          </div>
          <p className="connection-text">身份 · {session.email ?? "未绑定邮箱"}</p>
          <p className="connection-text">API · {apiBase}</p>
          <p className="connection-text">用户 · {session.userId}</p>
          <p className="connection-text">任务 · {tasks.length}</p>
          <button className="ghost-button full" type="button" onClick={onUseTestAccount}>
            切换测试账号（含示例歌）
          </button>
          <button className="ghost-button full" type="button" onClick={onResetIdentity}>
            退出并重置本机身份
          </button>
        </section>
      </aside>
    </div>
  );
}

function DiscoverPage({ feed, onOpen, onOpenCreator }: { feed: FeedItem[]; onOpen: (song: FeedItem) => void; onOpenCreator: (creatorId: string) => void }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFeed = normalizedQuery
    ? feed.filter((song) =>
        [song.title, song.theme, song.style, song.mood, song.creatorName]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : feed;

  return (
    <section className="page discover-page">
      <div className="page-title-row">
        <div>
          <h1>发现</h1>
          <p>搜索、风格、创作者和正在上升的作品会集中在这里。</p>
        </div>
      </div>
      <div className="glass-card discover-search">
        <span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索歌曲、风格或创作者" />
      </div>
      <section className="glass-card">
        <div className="section-heading">
          <h2>热门作品</h2>
          <span>{filteredFeed.length}</span>
        </div>
        {filteredFeed.length === 0 ? (
          <EmptyState title="没有匹配作品" body="换一个关键词，或先到广场刷新公开歌曲。" />
        ) : (
          <div className="drawer-work-list">
          {filteredFeed.slice(0, 8).map((song) => (
            <button key={song.id} type="button" onClick={() => onOpen(song)}>
              <CoverArt title={song.title} coverUrl={song.coverUrl} />
              <span>
                <strong>{song.title}</strong>
                <small>{displayNameLabel(song.creatorName)} · {formatCompact(song.playCount ?? 0)} 播放</small>
              </span>
            </button>
          ))}
          </div>
        )}
      </section>
      <section className="glass-card">
        <div className="section-heading">
          <h2>创作者</h2>
          <span>音乐广场</span>
        </div>
        <div className="creator-list">
          {uniqueCreators(filteredFeed).map((creator) => (
            <button key={creator.id} type="button" onClick={() => onOpenCreator(creator.id)}>
              <span>{displayInitial(creator.name)}</span>
              <strong>{displayNameLabel(creator.name)}</strong>
              <small>{formatCompact(creator.plays)} 播放</small>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function ProfilePage({
  session,
  stats,
  songs,
  rewards,
  tasks,
  likedSongs,
  favoriteSongs,
  apiBase,
  onOpen,
  onOpenRewards,
  onOpenSettings,
  onRefresh,
  onUseTestAccount,
  onResetIdentity
}: {
  session: ApiSession;
  stats: Array<{ label: string; value: number }>;
  songs: Song[];
  rewards: RewardHistory;
  tasks: MusicTask[];
  likedSongs: FeedItem[];
  favoriteSongs: FeedItem[];
  apiBase: string;
  onOpen: (song: Song | FeedItem) => void;
  onOpenRewards: () => void;
  onOpenSettings: () => void;
  onRefresh: () => Promise<void>;
  onUseTestAccount: () => void;
  onResetIdentity: () => void;
}) {
  const totalPlays = songs.reduce((sum, song) => sum + (song.playCount ?? 0), 0);
  return (
    <section className="page profile-page">
      <div className="profile-stage glass-card">
        <button className="icon-button settings-launch" type="button" onClick={onOpenSettings} aria-label="设置">
          ⚙
        </button>
        <div className="profile-avatar large">{displayInitial(session.displayName)}</div>
        <h1>{displayNameLabel(session.displayName)}</h1>
        <p>{session.email ?? "本机创作者身份"} · {planLabel(session.plan)}</p>
        <div className="profile-statline">
          <span>{formatCompact(totalPlays)} 播放</span>
          <span>{songs.length} 作品</span>
          <span>{formatPoints(rewards.balance)} 积分</span>
        </div>
        <div className="profile-actions">
          <button className="liquid-button compact" type="button" onClick={onOpenRewards}>
            收入与会员
          </button>
          <button className="ghost-button" type="button" onClick={() => void onRefresh()}>
            刷新
          </button>
          <button className="ghost-button" type="button" onClick={onUseTestAccount}>
            测试账号
          </button>
        </div>
      </div>
      <div className="metric-grid">
        {stats.map((stat) => (
          <Metric key={stat.label} label={stat.label} value={String(stat.value)} />
        ))}
      </div>
      <section className="glass-card">
        <div className="section-heading">
          <h2>我的作品</h2>
          <span>{tasks.length} 任务</span>
        </div>
        {songs.length === 0 ? (
          <EmptyState title="作品栏为空" body="生成成功后的歌曲会自动保存到这里。" />
        ) : (
          <div className="song-list-rows">
            {songs.map((song) => (
              <button key={song.id} type="button" onClick={() => onOpen(song)}>
                <CoverArt title={song.title} coverUrl={song.coverUrl} />
                <span>
                  <strong>{song.title}</strong>
                  <small>{song.visibility === "public" ? "公开" : "私密"} · {formatCompact(song.playCount ?? 0)} 播放</small>
                </span>
                <em>•••</em>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="glass-card social-library-panel">
        <div className="section-heading">
          <h2>喜欢与收藏</h2>
          <span>{likedSongs.length + favoriteSongs.length} 首</span>
        </div>
        <div className="social-library-grid">
          <MiniSongCollection title="喜欢列表" emptyText="在广场点击封面上的喜欢按钮后会出现在这里。" songs={likedSongs} onOpen={onOpen} />
          <MiniSongCollection title="收藏列表" emptyText="点星标收藏的作品会保存到这里。" songs={favoriteSongs} onOpen={onOpen} />
        </div>
      </section>
      <section className="glass-card account-panel">
        <div className="section-heading">
          <h2>连接信息</h2>
          <span>PWA</span>
        </div>
        <p className="connection-text">API · {apiBase}</p>
        <button className="ghost-button full" type="button" onClick={onResetIdentity}>
          退出并重置本机身份
        </button>
      </section>
    </section>
  );
}

function MiniSongCollection({
  title,
  emptyText,
  songs,
  onOpen
}: {
  title: string;
  emptyText: string;
  songs: FeedItem[];
  onOpen: (song: FeedItem) => void;
}) {
  return (
    <div className="mini-song-collection">
      <h3>{title}</h3>
      {songs.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <div className="mini-song-list">
          {songs.slice(0, 4).map((song) => (
            <button key={song.id} type="button" onClick={() => onOpen(song)}>
              <CoverArt title={song.title} coverUrl={song.coverUrl} />
              <span>
                <strong>{song.title}</strong>
                <small>{displayNameLabel(song.creatorName)} · {formatCompact(song.playCount ?? 0)} 播放</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ShareSheet({ song, onClose, onMessage }: { song: Song | FeedItem; onClose: () => void; onMessage: (message: string) => void }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const creatorName = isFeedItem(song) ? displayNameLabel(song.creatorName) : "Green Sonic 创作者";
  const shareUrl = `${window.location.origin}/?song=${encodeURIComponent(song.id)}`;
  const shareText = `我在 Green Sonic Gallery 听到《${song.title}》 - ${creatorName}`;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(shareText);
  const smsHref = `sms:?&body=${encodedText}%20${encodedUrl}`;
  const socialShareTargets = [
    {
      label: "Twitter/X",
      icon: "X",
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      notice: "正在打开 Twitter/X 分享。"
    },
    {
      label: "WhatsApp",
      icon: "◍",
      href: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      notice: "正在打开 WhatsApp 分享。"
    },
    {
      label: "Facebook",
      icon: "f",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      notice: "正在打开 Facebook 分享。"
    }
  ];

  function notify(message: string) {
    setFeedback(message);
    onMessage(message);
  }

  async function copyLink(message = "分享链接已复制。") {
    try {
      await writeClipboardText(shareUrl);
      notify(message);
    } catch {
      notify("浏览器拦截了复制权限，请手动复制当前页面链接。");
    }
  }

  async function nativeShare() {
    try {
      if (navigator.share) {
        await navigator.share({ title: song.title, text: shareText, url: shareUrl });
        notify("系统分享已打开。");
        return;
      }
      await copyLink("当前浏览器不支持系统分享，已复制链接。");
    } catch (unknown) {
      const name = typeof unknown === "object" && unknown !== null && "name" in unknown ? String((unknown as { name?: unknown }).name) : "";
      if (name === "AbortError") {
        notify("已取消分享。");
        return;
      }
      await copyLink("系统分享暂时不可用，已复制链接。");
    }
  }

  function downloadAudio() {
    if (!song.audioUrl) {
      void copyLink("这首歌还没有可下载音频，已先复制分享链接。");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = song.audioUrl;
    anchor.download = `${safeFileName(song.title)}.mp3`;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    notify("已开始下载；如果手机浏览器打开播放页，请长按音频保存。");
  }

  return (
    <div className="sheet-backdrop share-backdrop" role="dialog" aria-modal="true" aria-label="分享歌曲">
      <section className="share-sheet">
        <div className="sheet-handle" />
        <button className="icon-button sheet-close" type="button" onClick={onClose} aria-label="关闭分享">
          ×
        </button>
        <h2>分享歌曲</h2>
        <div className="share-cover">
          <CoverArt title={song.title} coverUrl={song.coverUrl} />
        </div>
        <h3>{song.title}</h3>
        <p>{creatorName}</p>
        {feedback && <div className="share-feedback" role="status">{feedback}</div>}
        <div className="share-actions">
          <button type="button" onClick={() => void copyLink()} aria-label="复制分享链接"><span>↗</span>复制链接</button>
          <button type="button" onClick={downloadAudio} aria-label="下载歌曲音频"><span>↓</span>下载</button>
          <button type="button" onClick={() => void nativeShare()} aria-label="打开系统分享"><span>◎</span>系统分享</button>
          <a href={smsHref} onClick={() => notify("正在打开短信分享；如果浏览器拦截，请使用复制链接。")} aria-label="短信分享"><span>●</span>短信</a>
          {socialShareTargets.map((target) => (
            <a
              key={target.label}
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => notify(target.notice)}
              aria-label={`分享到 ${target.label}`}
            >
              <span>{target.icon}</span>
              {target.label}
            </a>
          ))}
          <button type="button" onClick={() => { void copyLink("Instagram 网页端需要粘贴链接；已复制分享链接。"); }} aria-label="分享到 Instagram"><span>▣</span>Instagram</button>
        </div>
      </section>
    </div>
  );
}

function CommentsSheet({
  song,
  comments,
  draft,
  busy,
  setDraft,
  onClose,
  onSubmit,
  onLike,
  onNotice
}: {
  song: Song | FeedItem;
  comments: Comment[];
  draft: string;
  busy: BusyKey;
  setDraft: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onLike: (comment: Comment) => void;
  onNotice: (message: string) => void;
}) {
  const quickReactions = ["🔥", "😍", "😱", "🙌", "👍", "👎", "🥲"];
  const canSend = draft.trim().length > 0 && busy !== "comment";
  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) {
      onNotice("先写一句评论再发送。");
      return;
    }
    if (busy === "comment") {
      return;
    }
    onSubmit();
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="歌曲评论">
      <section className="comments-sheet">
        <div className="sheet-handle" />
        <button className="icon-button sheet-close" type="button" onClick={onClose} aria-label="关闭评论">
          ×
        </button>
        <h2>{comments.length} 条评论</h2>
        <div className="comment-scroll">
          {comments.length === 0 ? (
            <EmptyState title="还没有评论" body="成为第一个评价这首歌的人。" />
          ) : (
            comments.map((comment) => (
              <article className="social-comment" key={comment.id}>
                <div className="comment-avatar">{displayInitial(comment.userName)}</div>
                <div>
                  <strong>{displayNameLabel(comment.userName)} <span>{formatRelativeTime(comment.createdAt)}</span></strong>
                  <p>{comment.body}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const mention = `@${displayNameLabel(comment.userName)} `;
                      setDraft(draft.startsWith(mention) ? draft : `${mention}${draft}`);
                    }}
                  >
                    回复
                  </button>
                </div>
                <button className={comment.likedByMe ? "liked" : ""} type="button" onClick={() => onLike(comment)}>
                  {comment.likedByMe ? "♥" : "♡"} <span>{comment.likesCount}</span>
                </button>
              </article>
            ))
          )}
        </div>
        <div className="reaction-row">
          {quickReactions.map((reaction) => (
            <button key={reaction} type="button" onClick={() => setDraft(`${draft}${reaction}`)}>{reaction}</button>
          ))}
        </div>
        <form className="comment-compose" onSubmit={submitComment}>
          <span>{isFeedItem(song) ? displayInitial(song.creatorName) : "G"}</span>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写一句评论..." />
          <button type="submit" disabled={!canSend} aria-label="发送评论">
            {busy === "comment" ? "发送中" : "发送"}
          </button>
        </form>
      </section>
    </div>
  );
}

function CreatorProfileSheet({
  profile,
  isSelf,
  busy,
  onClose,
  onFollow,
  onOpenSong,
  onShare,
  onNotice
}: {
  profile: CreatorProfile;
  isSelf: boolean;
  busy: boolean;
  onClose: () => void;
  onFollow: (following: boolean) => void;
  onOpenSong: (song: FeedItem) => void;
  onShare: (song: FeedItem) => void;
  onNotice: (message: string) => void;
}) {
  const { creator, songs } = profile;
  return (
    <div className="creator-profile-screen" role="dialog" aria-modal="true" aria-label="创作者主页">
      <section className="creator-hero">
        <button className="icon-button" type="button" onClick={onClose} aria-label="返回">‹</button>
        <button className="icon-button" type="button" onClick={() => songs[0] && onShare(songs[0])} aria-label="分享">↗</button>
        <div className="creator-avatar">{displayInitial(creator.displayName)}</div>
        <h1>{displayNameLabel(creator.displayName)}</h1>
        <p>@{creatorHandle(creator.displayName)}</p>
        <div className="profile-statline">
          <span>{formatCompact(creator.totalPlayCount)} 播放</span>
          <span>{formatCompact(creator.followersCount)} 粉丝</span>
          <span>{formatCompact(creator.followingCount)} 关注中</span>
        </div>
        <button className="liquid-button follow-wide" type="button" disabled={busy || isSelf} onClick={() => onFollow(!creator.followedByMe)}>
          {isSelf ? "本人主页" : creator.followedByMe ? "取消关注" : "关注"}
        </button>
      </section>
      <section className="creator-content">
        <div className="section-heading">
          <h2>灵感片段</h2>
          <button className="ghost-inline" type="button" onClick={() => onNotice("已显示该创作者最近的灵感片段。")}>更多 ›</button>
        </div>
        <div className="hook-strip">
          {songs.slice(0, 3).map((song) => (
            <button key={song.id} type="button" onClick={() => onOpenSong(song)}>
              <CoverArt title={song.title} coverUrl={song.coverUrl} />
              <strong>{song.title}</strong>
              <span>▶ {formatCompact(song.playCount ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="section-heading">
          <h2>歌曲</h2>
          <button className="ghost-inline" type="button" onClick={() => onNotice("已显示该创作者最近 100 首公开作品。")}>更多 ›</button>
        </div>
        <div className="song-list-rows">
          {songs.map((song) => (
            <button key={song.id} type="button" onClick={() => onOpenSong(song)}>
              <CoverArt title={song.title} coverUrl={song.coverUrl} />
              <span>
                <strong>{song.title}</strong>
                <small>▶ {formatCompact(song.playCount ?? 0)}</small>
              </span>
              <em aria-hidden="true">›</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsSheet({
  fontScale,
  setFontScale,
  onClose,
  onResetIdentity,
  onOpenRewards,
  onNotice
}: {
  fontScale: number;
  setFontScale: (value: number) => void;
  onClose: () => void;
  onResetIdentity: () => void;
  onOpenRewards: () => void;
  onNotice: (message: string) => void;
}) {
  const [activeSetting, setActiveSetting] = useState("feedback");
  const rows = [
    {
      id: "feedback",
      label: "反馈",
      title: "反馈与客服",
      body: "遇到生成失败、支付疑问或作品问题，可以把截图、歌曲标题和发生时间发给我们。",
      items: ["客服邮箱：support@greensonic.ai", "建议附上设备型号、浏览器和问题页面。"],
      action: "复制客服邮箱"
    },
    {
      id: "language",
      label: "语言",
      title: "语言",
      body: "当前界面语言为简体中文。后续版本会加入英文和繁体中文。",
      items: ["中文优先覆盖创作、广场、评论、分享、挑战、奖励和设置页面。"]
    },
    {
      id: "referral",
      label: "推荐奖励",
      title: "推荐奖励",
      body: "邀请创作者发布公开作品后，平台审核通过会发放 Melody Points。",
      items: ["邀请 1 位有效创作者：+100 积分", "被邀请者首次发布公开作品：双方各 +25 积分", "异常注册、刷量或侵权作品不会结算。"]
    },
    {
      id: "social",
      label: "社交媒体",
      title: "社交媒体绑定",
      body: "分享面板已经支持复制链接、系统分享、短信、X、WhatsApp、Facebook 和 Instagram 链接复制。",
      items: ["正式 App 版本会继续接入 TikTok、YouTube Shorts 和 Instagram Stories 深度分享。"]
    },
    {
      id: "trash",
      label: "回收站",
      title: "回收站",
      body: "删除作品会先进入回收站，避免误删导致音频丢失。",
      items: ["当前没有已删除作品。", "公开作品下线后不会继续出现在音乐广场。"]
    },
    {
      id: "privacy",
      label: "隐私政策",
      title: "隐私政策",
      body: "MiniMax API Key 只在后端使用；PWA 本地只保存登录身份和必要的会话信息。",
      items: ["不会在前端暴露 API Key。", "作品、评论、点赞和积分记录会保存到服务器，用于同步和风控审核。"]
    },
    {
      id: "terms",
      label: "使用条款",
      title: "使用条款",
      body: "用户必须保证输入文本、上传图片和作品发布不侵犯第三方版权或肖像权。",
      items: ["禁止上传侵犯版权的参考音乐。", "积分和 USDC 兑换需经过平台风控审核。", "推广曝光和奖励按真实数据结算，不承诺固定收益。"]
    }
  ];
  const activeRow = rows.find((row) => row.id === activeSetting) ?? rows[0];

  function handleSettingAction() {
    if (activeRow.id === "feedback") {
      void writeClipboardText("support@greensonic.ai")
        .then(() => onNotice("已复制客服邮箱。"))
        .catch(() => onNotice("复制失败，请手动复制 support@greensonic.ai。"));
      return;
    }
    onNotice(`${activeRow.label}设置已展示在当前页面。`);
  }

  return (
    <div className="settings-screen" role="dialog" aria-modal="true" aria-label="设置">
      <button className="icon-button" type="button" onClick={onClose} aria-label="关闭设置">×</button>
      <div className="settings-profile">
        <div className="profile-avatar large">G</div>
        <div>
          <h1>Green Sonic</h1>
          <p>ID: 11249809</p>
          <span>◆ 10</span>
        </div>
      </div>
      <button className="subscription-strip" type="button" onClick={onOpenRewards}>专业会员 <strong>订阅 ›</strong></button>
      <label className="setting-slider">
        字体大小
        <input type="range" min="0.9" max="1.16" step="0.02" value={fontScale} onChange={(event) => setFontScale(Number(event.target.value))} />
      </label>
      <div className="settings-list">
        {rows.map((row) => (
          <button key={row.id} className={activeSetting === row.id ? "active" : ""} type="button" onClick={() => setActiveSetting(row.id)}>
            <span>{row.label}</span>
            <em>›</em>
          </button>
        ))}
      </div>
      <section className="settings-detail-panel">
        <p className="gold-label">设置详情</p>
        <h2>{activeRow.title}</h2>
        <p>{activeRow.body}</p>
        <ul>
          {activeRow.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <button className="ghost-button full" type="button" onClick={handleSettingAction}>
          {activeRow.action ?? "我知道了"}
        </button>
      </section>
      <button className="ghost-button full" type="button" onClick={onResetIdentity}>退出登录 / 重置身份</button>
      <p className="settings-footer">版本 V2.1.9 · 使用条款 | 隐私政策</p>
    </div>
  );
}
