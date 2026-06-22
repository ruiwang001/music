import { useMemo, useState } from "react";
import { formatDateTime, formatNumber, toInputDateTime } from "../lib/format";
import type { Challenge, ChallengeDraft } from "../types";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";

interface ChallengesManagerProps {
  challenges: Challenge[];
  isSubmitting: boolean;
  onCreate: (draft: ChallengeDraft) => Promise<void>;
}

export function ChallengesManager({ challenges, isSubmitting, onCreate }: ChallengesManagerProps) {
  const initialDraft = useMemo(createDefaultDraft, []);
  const [draft, setDraft] = useState<ChallengeDraft>(initialDraft);
  const [localError, setLocalError] = useState<string | undefined>();

  async function submitChallenge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.title.trim() || !draft.theme.trim()) {
      setLocalError("请填写挑战标题和主题。");
      return;
    }

    if (new Date(draft.endsAt).getTime() <= new Date(draft.startsAt).getTime()) {
      setLocalError("结束时间必须晚于开始时间。");
      return;
    }

    setLocalError(undefined);
    await onCreate({
      ...draft,
      title: draft.title.trim(),
      theme: draft.theme.trim(),
      description: draft.description.trim()
    });
    setDraft(createDefaultDraft());
  }

  return (
    <section className="view-stack" aria-labelledby="challenges-title">
      <div className="view-heading">
        <div>
          <h2 id="challenges-title">挑战运营</h2>
          <p>管理每日音乐主题、投稿窗口和创作者奖励。</p>
        </div>
      </div>

      <div className="challenge-layout">
        <section className="panel panel--table">
          <div className="panel__header">
            <div>
              <h3>挑战列表</h3>
              <p>{formatNumber(challenges.length)} 个已排期主题</p>
            </div>
          </div>

          {challenges.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>挑战</th>
                    <th>时间窗口</th>
                    <th>参与门槛</th>
                    <th>奖励</th>
                    <th>投稿</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map((challenge) => (
                    <tr key={challenge.id}>
                      <td className="cell-wide">
                        <div className="cell-stack">
                          <strong>{challenge.title}</strong>
                          <span>{challenge.theme}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span>{formatDateTime(challenge.startsAt)}</span>
                          <span>{formatDateTime(challenge.endsAt)}</span>
                        </div>
                      </td>
                      <td>{planLabelByKey[challenge.minPlan] ?? challenge.minPlan}</td>
                      <td>{formatNumber(challenge.rewardPoints)} 积分</td>
                      <td>{formatNumber(challenge.submissionsCount ?? 0)}</td>
                      <td>
                        <StatusPill status={challenge.isActive ? "active" : "inactive"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="暂无挑战主题" detail="创建第一个每日主题后，创作者就可以投稿。" />
          )}
        </section>

        <form className="panel form-panel" onSubmit={(event) => void submitChallenge(event)}>
          <div className="panel__header">
            <div>
              <h3>新建每日主题</h3>
              <p>创建后会开启一个可投稿的挑战窗口。</p>
            </div>
          </div>

          <label className="field">
            <span>标题</span>
            <input
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="每日灵感"
              value={draft.title}
            />
          </label>

          <label className="field">
            <span>主题</span>
            <input
              onChange={(event) => setDraft((current) => ({ ...current, theme: event.target.value }))}
              placeholder="为刚醒来的城市写一首希望之歌"
              value={draft.theme}
            />
          </label>

          <label className="field">
            <span>说明</span>
            <textarea
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="展示给创作者的简短规则或灵感说明。"
              rows={4}
              value={draft.description}
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>开始时间</span>
              <input
                onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))}
                type="datetime-local"
                value={draft.startsAt}
              />
            </label>

            <label className="field">
              <span>结束时间</span>
              <input
                onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))}
                type="datetime-local"
                value={draft.endsAt}
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>最低套餐</span>
              <select
                onChange={(event) => setDraft((current) => ({ ...current, minPlan: event.target.value as ChallengeDraft["minPlan"] }))}
                value={draft.minPlan}
              >
                <option value="free">免费版</option>
                <option value="pro">专业版</option>
                <option value="creator">创作者版</option>
              </select>
            </label>

            <label className="field">
              <span>奖励积分</span>
              <input
                min={0}
                onChange={(event) => setDraft((current) => ({ ...current, rewardPoints: Number(event.target.value) }))}
                type="number"
                value={draft.rewardPoints}
              />
            </label>
          </div>

          {localError ? <p className="form-error">{localError}</p> : null}

          <button className="button button--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "创建中" : "创建挑战"}
          </button>
        </form>
      </div>
    </section>
  );
}

function createDefaultDraft(): ChallengeDraft {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return {
    title: "每日灵感",
    theme: "",
    description: "",
    startsAt: toInputDateTime(start),
    endsAt: toInputDateTime(end),
    minPlan: "creator",
    rewardPoints: 1000
  };
}

const planLabelByKey: Record<string, string> = {
  free: "免费版",
  pro: "专业版",
  creator: "创作者版"
};
