import { useMemo, useState } from "react";
import { formatDateTime, formatMinutes, formatNumber, shortId } from "../lib/format";
import type { AdminUser, Plan } from "../types";
import { EmptyState } from "./EmptyState";

interface UsersManagerProps {
  users: AdminUser[];
}

const planFilters: Array<Plan | "all"> = ["all", "free", "pro", "creator"];

export function UsersManager({ users }: UsersManagerProps) {
  const [planFilter, setPlanFilter] = useState<Plan | "all">("all");
  const [query, setQuery] = useState("");

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesPlan = planFilter === "all" || user.plan === planFilter;
      const searchable = `${user.id} ${user.email ?? ""} ${user.displayName} ${user.platforms.join(" ")} ${user.riskStatus}`.toLowerCase();
      return matchesPlan && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [planFilter, query, users]);

  const activeToday = users.filter((user) => user.lastSeenAt && new Date(user.lastSeenAt).toDateString() === new Date().toDateString()).length;

  return (
    <section className="view-stack" aria-labelledby="users-title">
      <div className="view-heading">
        <div>
          <h2 id="users-title">用户运营</h2>
          <p>查看注册、设备、平台、活跃时间、积分余额和作品贡献。</p>
        </div>
      </div>

      <div className="mini-metric-grid">
        <Metric label="用户总数" value={formatNumber(users.length)} />
        <Metric label="今日活跃" value={formatNumber(activeToday)} />
        <Metric label="设备记录" value={formatNumber(users.reduce((total, user) => total + user.deviceCount, 0))} />
        <Metric label="积分余额" value={formatNumber(users.reduce((total, user) => total + user.pointsBalance, 0))} />
      </div>

      <div className="toolbar">
        <div className="segmented-control" role="group" aria-label="用户套餐筛选">
          {planFilters.map((plan) => (
            <button
              className={plan === planFilter ? "segment segment--active" : "segment"}
              key={plan}
              onClick={() => setPlanFilter(plan)}
              type="button"
            >
              {plan === "all" ? "全部" : planLabelByKey[plan]}
            </button>
          ))}
        </div>
        <label className="search-field">
          <span>搜索</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="邮箱、昵称、设备、风险状态"
            type="search"
            value={query}
          />
        </label>
      </div>

      <section className="panel panel--table">
        {filteredUsers.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>套餐</th>
                  <th>积分</th>
                  <th>作品</th>
                  <th>互动</th>
                  <th>设备/平台</th>
                  <th>服务时间</th>
                  <th>注册/最近访问</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="cell-wide">
                      <div className="cell-stack">
                        <strong>{user.displayName}</strong>
                        <span>{user.email || "游客身份"}</span>
                        <code>{shortId(user.id)}</code>
                      </div>
                    </td>
                    <td>{planLabelByKey[user.plan]}</td>
                    <td>
                      <div className="cell-stack">
                        <strong>{formatNumber(user.pointsBalance)}</strong>
                        <span>{user.riskStatus}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong>{formatNumber(user.songsCount)} 首</strong>
                        <span>{formatNumber(user.publicSongsCount)} 公开</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span>{formatNumber(user.totalViews)} 浏览</span>
                        <span>{formatNumber(user.totalPlays)} 播放</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong>{formatNumber(user.deviceCount)} 台设备</strong>
                        <span>{user.platforms.length ? user.platforms.join(" / ") : "暂无设备记录"}</span>
                        <span>{formatNumber(user.requestCount)} 次访问</span>
                      </div>
                    </td>
                    <td>{formatMinutes(user.serviceMinutes)}</td>
                    <td>
                      <div className="cell-stack">
                        <span>{formatDateTime(user.createdAt)}</span>
                        <span>{formatDateTime(user.lastSeenAt ?? undefined)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="没有匹配用户" detail="换一个筛选条件或关键词再试。" />
        )}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

const planLabelByKey: Record<Plan, string> = {
  free: "免费版",
  pro: "专业版",
  creator: "创作者版"
};
