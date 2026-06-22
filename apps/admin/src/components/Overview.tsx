import { formatCurrencyFromCents, formatNumber } from "../lib/format";
import type { Challenge, MusicTaskAudit, OverviewData, RewardWithdrawal } from "../types";
import { StatusPill } from "./StatusPill";

interface OverviewProps {
  overview: OverviewData;
  tasks: MusicTaskAudit[];
  withdrawals: RewardWithdrawal[];
  challenges: Challenge[];
}

export function Overview({ overview, tasks, withdrawals, challenges }: OverviewProps) {
  const metrics = [
    { label: "用户", value: formatNumber(overview.usersCount), detail: "已创建身份的创作者", tone: "info" },
    { label: "今日注册", value: formatNumber(overview.todayUsersCount), detail: "今天新增用户", tone: "info" },
    { label: "今日活跃", value: formatNumber(overview.activeUsersToday), detail: `7日活跃 ${formatNumber(overview.activeUsers7d)}`, tone: "good" },
    { label: "作品", value: formatNumber(overview.songsCount), detail: "已生成音乐库", tone: "good" },
    { label: "任务", value: formatNumber(overview.tasksCount), detail: "MiniMax 生成记录", tone: "neutral" },
    {
      label: "待审提现",
      value: formatNumber(overview.pendingWithdrawalsCount),
      detail: "需要人工风控复核",
      tone: overview.pendingWithdrawalsCount > 0 ? "warn" : "good"
    },
    {
      label: "MiniMax 成本",
      value: formatCurrencyFromCents(overview.minimaxCostCents),
      detail: `失败成本 ${formatCurrencyFromCents(overview.minimaxFailedCostCents)}`,
      tone: "danger"
    },
    {
      label: "平台积分",
      value: formatNumber(overview.totalPointsBalance),
      detail: `累计发放 ${formatNumber(overview.lifetimePointsIssued)}`,
      tone: "warn"
    },
    {
      label: "USDC 申请",
      value: `${overview.totalUsdcRequested.toFixed(2)}`,
      detail: `${formatNumber(overview.reservedPoints)} 积分待审`,
      tone: "warn"
    },
    {
      label: "互动数据",
      value: formatNumber(overview.totalPlays),
      detail: `${formatNumber(overview.totalViews)} 浏览 / ${formatNumber(overview.totalComments)} 评论`,
      tone: "info"
    }
  ];

  const recentFailures = tasks.filter((task) => task.status === "failed").slice(0, 4);
  const urgentWithdrawals = withdrawals.filter((item) => item.status === "pending_review").slice(0, 4);

  return (
    <section className="view-stack" aria-labelledby="overview-title">
      <div className="view-heading">
        <div>
          <h2 id="overview-title">运营总览</h2>
          <p>实时查看作品增长、生成健康度、奖励审核和 MiniMax 成本。</p>
        </div>
      </div>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <article className={`metric-card metric-card--${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>

      <div className="split-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h3>生成状态</h3>
              <p>生成队列分布</p>
            </div>
          </div>
          <div className="status-grid">
            {(["queued", "generating", "succeeded", "failed"] as const).map((status) => (
              <div className="status-row" key={status}>
                <StatusPill status={status} />
                <strong>{formatNumber(overview.taskStatusCounts[status] ?? 0)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h3>提现风控</h3>
              <p>当前奖励风控进度</p>
            </div>
          </div>
          <div className="status-grid">
            {(["pending_review", "approved", "rejected", "paid"] as const).map((status) => (
              <div className="status-row" key={status}>
                <StatusPill status={status} />
                <strong>{formatNumber(overview.withdrawalStatusCounts[status] ?? 0)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="split-grid split-grid--wide">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h3>近期失败</h3>
              <p>需要排查的 MiniMax 任务</p>
            </div>
          </div>
          {recentFailures.length > 0 ? (
            <div className="compact-list">
              {recentFailures.map((task) => (
                <div className="compact-row" key={task.id}>
                  <div>
                    <strong>{task.title || task.prompt}</strong>
                    <span>{task.errorMessage || task.errorCode || "未知 MiniMax 错误"}</span>
                  </div>
                  <small>{formatCurrencyFromCents(task.estimatedCostCents)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-line">当前结果里没有失败的 MiniMax 任务。</p>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h3>审核队列</h3>
              <p>待审核的 USDC 申请</p>
            </div>
          </div>
          {urgentWithdrawals.length > 0 ? (
            <div className="compact-list">
              {urgentWithdrawals.map((withdrawal) => (
                <div className="compact-row" key={withdrawal.id}>
                  <div>
                    <strong>{withdrawal.userDisplayName || withdrawal.userId || "创作者"}</strong>
                    <span>{withdrawal.walletAddress}</span>
                  </div>
                  <small>{formatNumber(withdrawal.amountPoints)} 积分</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-line">暂无待审核的提现申请。</p>
          )}
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h3>挑战覆盖</h3>
              <p>正在开放的每日主题</p>
            </div>
          </div>
          <div className="challenge-summary">
            <strong>{formatNumber(overview.activeChallengesCount || challenges.filter((item) => item.isActive).length)}</strong>
            <span>个进行中的挑战窗口</span>
          </div>
        </section>
      </div>
    </section>
  );
}
