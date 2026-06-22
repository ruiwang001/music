import { useCallback, useEffect, useState } from "react";
import { adminApi, apiConfig, clearAdminAccessKey, hasAdminAccessKey, setAdminAccessKey } from "./api";
import { ChallengesManager } from "./components/ChallengesManager";
import { Overview } from "./components/Overview";
import { SettingsManager } from "./components/SettingsManager";
import { Shell } from "./components/Shell";
import { SongsManager } from "./components/SongsManager";
import { TasksAudit } from "./components/TasksAudit";
import { UsersManager } from "./components/UsersManager";
import { WithdrawalsReview } from "./components/WithdrawalsReview";
import { formatDateTime } from "./lib/format";
import type { AdminSnapshot, AdminView, ChallengeDraft, PlatformSettingsDraft, RequestState, ReviewDecision } from "./types";

const emptySnapshot: AdminSnapshot = {
  overview: {
    usersCount: 0,
    songsCount: 0,
    tasksCount: 0,
    pendingWithdrawalsCount: 0,
    minimaxCostCents: 0,
    minimaxFailedCostCents: 0,
    taskStatusCounts: {},
    withdrawalStatusCounts: {},
    activeChallengesCount: 0,
    todayUsersCount: 0,
    activeUsersToday: 0,
    activeUsers7d: 0,
    totalPointsBalance: 0,
    lifetimePointsIssued: 0,
    reservedPoints: 0,
    totalUsdcRequested: 0,
    totalPlays: 0,
    totalViews: 0,
    totalComments: 0,
    settings: {
      pointsPerUsdc: 10,
      minWithdrawalPoints: 10,
      publishRewardPoints: 25,
      updatedAt: null
    }
  },
  users: [],
  songs: [],
  tasks: [],
  withdrawals: [],
  challenges: [],
  settings: {
    pointsPerUsdc: 10,
    minWithdrawalPoints: 10,
    publishRewardPoints: 25,
    updatedAt: null
  }
};

export default function App() {
  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [snapshot, setSnapshot] = useState<AdminSnapshot>(emptySnapshot);
  const [requestState, setRequestState] = useState<RequestState>({ loading: true });
  const [isSubmitting, setSubmitting] = useState(false);
  const [hasAdminKey, setHasAdminKey] = useState(() => hasAdminAccessKey());
  const [adminKeyDraft, setAdminKeyDraft] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | undefined>();

  const loadSnapshot = useCallback(async () => {
    if (!hasAdminAccessKey()) {
      setRequestState({ loading: false, error: "请先输入后台管理密钥。" });
      return;
    }

    setRequestState({ loading: true });

    try {
      const [overview, users, songs, tasks, withdrawals, challenges, settings] = await Promise.all([
        adminApi.getOverview(),
        adminApi.getUsers(),
        adminApi.getSongs(),
        adminApi.getMusicTasks(),
        adminApi.getWithdrawals(),
        adminApi.getChallenges(),
        adminApi.getSettings()
      ]);

      setSnapshot({ overview, users, songs, tasks, withdrawals, challenges, settings });
      setLastUpdated(formatDateTime(new Date().toISOString()));
      setRequestState({ loading: false, message: "后台数据已刷新。" });
    } catch (error) {
      setRequestState({
        loading: false,
        error: error instanceof Error ? error.message : "无法加载后台数据。"
      });
    }
  }, []);

  useEffect(() => {
    if (hasAdminKey) {
      void loadSnapshot();
      return;
    }

    setRequestState({ loading: false });
  }, [hasAdminKey, loadSnapshot]);

  function saveAdminKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextKey = adminKeyDraft.trim();

    if (!nextKey) {
      setRequestState({ loading: false, error: "请输入后台管理密钥。" });
      return;
    }

    setAdminAccessKey(nextKey);
    setHasAdminKey(true);
    setAdminKeyDraft("");
    void loadSnapshot();
  }

  function clearAdminKey() {
    clearAdminAccessKey();
    setHasAdminKey(hasAdminAccessKey());
    setSnapshot(emptySnapshot);
    setLastUpdated(undefined);
    setRequestState({ loading: false, message: "已退出后台管理会话。" });
  }

  async function reviewWithdrawal(id: string, decision: ReviewDecision, riskNote: string) {
    setSubmitting(true);
    setRequestState((current) => ({ ...current, message: undefined, error: undefined }));

    try {
      await adminApi.reviewWithdrawal(id, decision, riskNote);
      await loadSnapshot();
      setRequestState({ loading: false, message: `提现申请已${decision === "approved" ? "通过" : "拒绝"}。` });
    } catch (error) {
      setRequestState({
        loading: false,
        error: error instanceof Error ? error.message : "无法提交提现审核结果。"
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function createChallenge(draft: ChallengeDraft) {
    setSubmitting(true);
    setRequestState((current) => ({ ...current, message: undefined, error: undefined }));

    try {
      await adminApi.createChallenge(draft);
      await loadSnapshot();
      setRequestState({ loading: false, message: "挑战主题已创建。" });
    } catch (error) {
      setRequestState({
        loading: false,
        error: error instanceof Error ? error.message : "无法创建挑战主题。"
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateSettings(draft: PlatformSettingsDraft) {
    setSubmitting(true);
    setRequestState((current) => ({ ...current, message: undefined, error: undefined }));

    try {
      await adminApi.updateSettings(draft);
      await loadSnapshot();
      setRequestState({ loading: false, message: "平台参数已保存，PWA 奖励页会读取新规则。" });
    } catch (error) {
      setRequestState({
        loading: false,
        error: error instanceof Error ? error.message : "无法保存平台参数。"
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateSongVisibility(id: string, visibility: "private" | "public", moderationNote: string) {
    setSubmitting(true);
    setRequestState((current) => ({ ...current, message: undefined, error: undefined }));

    try {
      await adminApi.updateSongVisibility(id, visibility, moderationNote);
      await loadSnapshot();
      setRequestState({ loading: false, message: visibility === "public" ? "作品已恢复公开。" : "作品已设为私密。" });
    } catch (error) {
      setRequestState({
        loading: false,
        error: error instanceof Error ? error.message : "无法更新作品状态。"
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell
      activeView={activeView}
      apiBaseUrl={apiConfig.baseUrl}
      hasAdminKey={hasAdminKey}
      isLoading={requestState.loading}
      lastUpdated={lastUpdated}
      onClearAdminKey={clearAdminKey}
      onRefresh={() => void loadSnapshot()}
      onViewChange={setActiveView}
    >
      {requestState.error ? <div className="notice notice--error">{requestState.error}</div> : null}
      {requestState.message && !requestState.error ? <div className="notice notice--success">{requestState.message}</div> : null}

      {!hasAdminKey ? (
        <AdminKeyPanel
          adminKeyDraft={adminKeyDraft}
          isLoading={requestState.loading}
          onChange={setAdminKeyDraft}
          onSubmit={saveAdminKey}
        />
      ) : null}

      {hasAdminKey && activeView === "overview" ? (
        <Overview
          challenges={snapshot.challenges}
          overview={snapshot.overview}
          tasks={snapshot.tasks}
          withdrawals={snapshot.withdrawals}
        />
      ) : null}
      {hasAdminKey && activeView === "users" ? <UsersManager users={snapshot.users} /> : null}
      {hasAdminKey && activeView === "songs" ? (
        <SongsManager isSubmitting={isSubmitting} onUpdateVisibility={updateSongVisibility} songs={snapshot.songs} />
      ) : null}
      {hasAdminKey && activeView === "tasks" ? <TasksAudit tasks={snapshot.tasks} /> : null}
      {hasAdminKey && activeView === "withdrawals" ? (
        <WithdrawalsReview isSubmitting={isSubmitting} onReview={reviewWithdrawal} withdrawals={snapshot.withdrawals} />
      ) : null}
      {hasAdminKey && activeView === "challenges" ? (
        <ChallengesManager challenges={snapshot.challenges} isSubmitting={isSubmitting} onCreate={createChallenge} />
      ) : null}
      {hasAdminKey && activeView === "settings" ? (
        <SettingsManager isSubmitting={isSubmitting} onSave={updateSettings} overview={snapshot.overview} settings={snapshot.settings} />
      ) : null}
    </Shell>
  );
}

interface AdminKeyPanelProps {
  adminKeyDraft: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function AdminKeyPanel({ adminKeyDraft, isLoading, onChange, onSubmit }: AdminKeyPanelProps) {
  return (
    <section className="admin-key-panel">
      <div>
        <span className="panel-kicker">安全访问</span>
        <h2>输入后台管理密钥</h2>
        <p>管理后台可以修改兑换比例、下架歌曲和审核提现，所以需要先完成一次本机授权。</p>
      </div>
      <form className="admin-key-form" onSubmit={onSubmit}>
        <label className="field">
          <span>管理密钥</span>
          <input
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
            placeholder="输入 ADMIN_API_KEY"
            type="password"
            value={adminKeyDraft}
          />
        </label>
        <button className="button button--primary" disabled={isLoading} type="submit">
          进入后台
        </button>
      </form>
    </section>
  );
}
