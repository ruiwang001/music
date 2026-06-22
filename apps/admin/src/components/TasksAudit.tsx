import { useMemo, useState } from "react";
import { formatCurrencyFromCents, formatDateTime, formatDuration, formatNumber, shortId } from "../lib/format";
import type { MusicTaskAudit, TaskStatus } from "../types";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";

interface TasksAuditProps {
  tasks: MusicTaskAudit[];
}

const statuses: Array<TaskStatus | "all"> = ["all", "queued", "generating", "succeeded", "failed"];

export function TasksAudit({ tasks }: TasksAuditProps) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [query, setQuery] = useState("");
  const succeededCount = tasks.filter((task) => task.status === "succeeded").length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const generatingCount = tasks.filter((task) => task.status === "queued" || task.status === "generating").length;
  const successRate = tasks.length > 0 ? Math.round((succeededCount / tasks.length) * 100) : 0;

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const searchable = `${task.id} ${task.userId ?? ""} ${task.userDisplayName ?? ""} ${task.userEmail ?? ""} ${task.title ?? ""} ${task.songTitle ?? ""} ${task.prompt} ${task.style} ${task.mood} ${task.errorMessage ?? ""}`
        .toLowerCase()
        .trim();
      return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [query, statusFilter, tasks]);

  return (
    <section className="view-stack" aria-labelledby="tasks-title">
      <div className="view-heading">
        <div>
          <h2 id="tasks-title">用户生成记录</h2>
          <p>查看每个用户生成歌曲的记录、是否成功、失败原因、生成出的歌曲和 MiniMax 成本。</p>
        </div>
      </div>

      <div className="metric-grid">
        <article className="metric-card metric-card--info">
          <span>生成记录</span>
          <strong>{formatNumber(tasks.length)}</strong>
          <small>最近 200 条</small>
        </article>
        <article className="metric-card metric-card--good">
          <span>成功生成</span>
          <strong>{formatNumber(succeededCount)}</strong>
          <small>{successRate}% 成功率</small>
        </article>
        <article className="metric-card metric-card--danger">
          <span>失败任务</span>
          <strong>{formatNumber(failedCount)}</strong>
          <small>可查看错误原因</small>
        </article>
        <article className="metric-card metric-card--warn">
          <span>处理中</span>
          <strong>{formatNumber(generatingCount)}</strong>
          <small>排队中 / 生成中</small>
        </article>
      </div>

      <div className="toolbar">
        <div className="segmented-control" role="group" aria-label="任务状态筛选">
          {statuses.map((status) => (
            <button
              className={status === statusFilter ? "segment segment--active" : "segment"}
              key={status}
              onClick={() => setStatusFilter(status)}
              type="button"
            >
              {status === "all" ? "全部" : statusLabelByFilter[status]}
            </button>
          ))}
        </div>
        <label className="search-field">
          <span>搜索</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="用户、邮箱、歌曲、任务、提示词或错误"
            type="search"
            value={query}
          />
        </label>
      </div>

      <section className="panel panel--table">
        {filteredTasks.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>任务</th>
                  <th>用户</th>
                  <th>状态</th>
                  <th>生成结果</th>
                  <th>提示词</th>
                  <th>生成歌曲</th>
                  <th>MiniMax</th>
                  <th>错误</th>
                  <th>成本</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <div className="cell-stack">
                        <code>{shortId(task.id)}</code>
                        <span>{formatDateTime(task.createdAt)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <strong>{task.userDisplayName || "未命名用户"}</strong>
                        <span>{task.userEmail || "游客 / 本机身份"}</span>
                        <code>{shortId(task.userId)}</code>
                      </div>
                    </td>
                    <td>
                      <StatusPill status={task.status} />
                    </td>
                    <td>
                      <div className={task.isSuccessful ? "result-badge result-badge--success" : task.status === "failed" ? "result-badge result-badge--failed" : "result-badge"}>
                        {task.isSuccessful ? "已成功生成" : task.status === "failed" ? "生成失败" : "处理中"}
                      </div>
                      {task.quotaRefunded ? <small className="muted-line">已返还额度</small> : null}
                    </td>
                    <td className="cell-wide">
                      <div className="cell-stack">
                        <strong>{task.title || task.prompt}</strong>
                        <span>
                          {task.style} / {task.mood} / {task.mode}
                        </span>
                      </div>
                    </td>
                    <td className="cell-wide">
                      {task.hasGeneratedSong ? (
                        <div className="cell-stack">
                          <strong>{task.songTitle || task.title || "已生成歌曲"}</strong>
                          <span>{task.songVisibility === "public" ? "公开作品" : "私密作品"}</span>
                          <code>{shortId(task.songId ?? undefined)}</code>
                        </div>
                      ) : (
                        <span className="muted-line">暂无歌曲</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span>{task.minimaxModel || "无模型信息"}</span>
                        <small>
                          {task.minimaxStatusCode ?? "--"} / {formatDuration(task.durationMs)}
                        </small>
                        <code>{shortId(task.minimaxTraceId)}</code>
                      </div>
                    </td>
                    <td className="cell-wide">
                      {task.errorMessage || task.errorCode ? (
                        <div className="error-copy">
                          <strong>{task.errorCode || "MiniMax 错误"}</strong>
                          <span>{task.errorMessage}</span>
                        </div>
                      ) : (
                        <span className="muted-line">无错误</span>
                      )}
                    </td>
                    <td>{formatCurrencyFromCents(task.estimatedCostCents)}</td>
                    <td>
                      <div className="cell-stack">
                        <span>开始：{formatDateTime(task.startedAt ?? task.createdAt)}</span>
                        <span>完成：{formatDateTime(task.completedAt)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="没有匹配的任务" detail="换一个状态或关键词再试。" />
        )}
      </section>
    </section>
  );
}

const statusLabelByFilter: Record<TaskStatus, string> = {
  queued: "排队中",
  generating: "生成中",
  succeeded: "成功",
  failed: "失败"
};
