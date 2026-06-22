import type { AdminView } from "../types";

interface ShellProps {
  activeView: AdminView;
  apiBaseUrl: string;
  hasAdminKey: boolean;
  isLoading: boolean;
  lastUpdated?: string;
  onClearAdminKey: () => void;
  onRefresh: () => void;
  onViewChange: (view: AdminView) => void;
  children: React.ReactNode;
}

const navItems: Array<{ id: AdminView; label: string; description: string }> = [
  { id: "overview", label: "运营总览", description: "业务健康度" },
  { id: "users", label: "用户运营", description: "注册、设备、活跃" },
  { id: "songs", label: "歌曲管理", description: "作品、互动、上下架" },
  { id: "tasks", label: "生成审计", description: "MiniMax 成本与失败" },
  { id: "withdrawals", label: "奖励审核", description: "USDC 风控队列" },
  { id: "challenges", label: "挑战运营", description: "每日主题管理" },
  { id: "settings", label: "平台设置", description: "积分与兑换规则" }
];

export function Shell({
  activeView,
  apiBaseUrl,
  hasAdminKey,
  isLoading,
  lastUpdated,
  onClearAdminKey,
  onRefresh,
  onViewChange,
  children
}: ShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            M
          </div>
          <div>
            <h1>Green Sonic 后台</h1>
            <p>创作者运营中心</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="后台模块">
          {navItems.map((item) => (
            <button
              className={item.id === activeView ? "nav-item nav-item--active" : "nav-item"}
              key={item.id}
              onClick={() => onViewChange(item.id)}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar__meta">
            <span className={hasAdminKey ? "env-dot env-dot--ready" : "env-dot env-dot--missing"} />
            <span>{apiBaseUrl}</span>
            <span>{hasAdminKey ? (lastUpdated ? `更新于 ${lastUpdated}` : "尚未加载") : "等待管理密钥"}</span>
          </div>
          <div className="topbar__actions">
            {hasAdminKey ? (
              <button className="button button--subtle" disabled={isLoading} onClick={onClearAdminKey} type="button">
                退出后台
              </button>
            ) : null}
            <button className="button button--primary" disabled={isLoading || !hasAdminKey} onClick={onRefresh} type="button">
              {isLoading ? "刷新中" : "刷新数据"}
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
