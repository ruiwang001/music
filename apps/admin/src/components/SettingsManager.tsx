import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatNumber, formatUsdc } from "../lib/format";
import type { OverviewData, PlatformSettings, PlatformSettingsDraft } from "../types";

interface SettingsManagerProps {
  isSubmitting: boolean;
  onSave: (draft: PlatformSettingsDraft) => Promise<void>;
  overview: OverviewData;
  settings: PlatformSettings;
}

export function SettingsManager({ isSubmitting, onSave, overview, settings }: SettingsManagerProps) {
  const [draft, setDraft] = useState<PlatformSettingsDraft>(() => ({
    pointsPerUsdc: settings.pointsPerUsdc,
    minWithdrawalPoints: settings.minWithdrawalPoints,
    publishRewardPoints: settings.publishRewardPoints
  }));
  const [localError, setLocalError] = useState<string | undefined>();

  useEffect(() => {
    setDraft({
      pointsPerUsdc: settings.pointsPerUsdc,
      minWithdrawalPoints: settings.minWithdrawalPoints,
      publishRewardPoints: settings.publishRewardPoints
    });
  }, [settings]);

  const preview = useMemo(() => {
    const estimatedUsdc = draft.pointsPerUsdc > 0 ? draft.minWithdrawalPoints / draft.pointsPerUsdc : 0;
    return {
      minWithdrawalUsdc: estimatedUsdc,
      allBalanceUsdc: draft.pointsPerUsdc > 0 ? overview.totalPointsBalance / draft.pointsPerUsdc : 0
    };
  }, [draft, overview.totalPointsBalance]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isInteger(draft.pointsPerUsdc) || draft.pointsPerUsdc <= 0) {
      setLocalError("兑换比例必须是大于 0 的整数。");
      return;
    }
    if (!Number.isInteger(draft.minWithdrawalPoints) || draft.minWithdrawalPoints <= 0) {
      setLocalError("最低提现门槛必须是大于 0 的整数。");
      return;
    }
    if (!Number.isInteger(draft.publishRewardPoints) || draft.publishRewardPoints < 0) {
      setLocalError("发布奖励不能小于 0。");
      return;
    }
    setLocalError(undefined);
    await onSave(draft);
  }

  return (
    <section className="view-stack" aria-labelledby="settings-title">
      <div className="view-heading">
        <div>
          <h2 id="settings-title">平台设置</h2>
          <p>调整积分经济、USDC 兑换、发布奖励等关键运营参数。保存后 PWA 奖励页会读取新规则。</p>
        </div>
      </div>

      <div className="settings-grid">
        <form className="panel form-panel" onSubmit={(event) => void submit(event)}>
          <div className="panel__header">
            <div>
              <h3>积分与 USDC 规则</h3>
              <p>这些设置会直接影响用户兑换和发布奖励。</p>
            </div>
          </div>

          <label className="field">
            <span>兑换比例：多少积分 = 1 USDC</span>
            <input
              min={1}
              onChange={(event) => setDraft((current) => ({ ...current, pointsPerUsdc: Number(event.target.value) }))}
              type="number"
              value={draft.pointsPerUsdc}
            />
          </label>

          <label className="field">
            <span>最低提现门槛（积分）</span>
            <input
              min={1}
              onChange={(event) => setDraft((current) => ({ ...current, minWithdrawalPoints: Number(event.target.value) }))}
              type="number"
              value={draft.minWithdrawalPoints}
            />
          </label>

          <label className="field">
            <span>首次发布作品奖励（积分）</span>
            <input
              min={0}
              onChange={(event) => setDraft((current) => ({ ...current, publishRewardPoints: Number(event.target.value) }))}
              type="number"
              value={draft.publishRewardPoints}
            />
          </label>

          {localError ? <p className="form-error">{localError}</p> : null}

          <button className="button button--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "保存中" : "保存平台参数"}
          </button>
        </form>

        <aside className="panel settings-preview">
          <div className="panel__header">
            <div>
              <h3>实时影响预览</h3>
              <p>用于运营判断，不会直接承诺收益。</p>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>当前兑换比例</dt>
              <dd>{formatNumber(draft.pointsPerUsdc)} 积分 = 1 USDC</dd>
            </div>
            <div>
              <dt>最低提现折算</dt>
              <dd>{formatUsdc(preview.minWithdrawalUsdc)}</dd>
            </div>
            <div>
              <dt>平台积分负债估算</dt>
              <dd>{formatUsdc(preview.allBalanceUsdc)}</dd>
            </div>
            <div>
              <dt>已发行积分</dt>
              <dd>{formatNumber(overview.lifetimePointsIssued)}</dd>
            </div>
            <div>
              <dt>配置更新时间</dt>
              <dd>{formatDateTime(settings.updatedAt ?? undefined)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
