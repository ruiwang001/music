import { useMemo, useState } from "react";
import { formatDateTime, formatNumber, formatUsdc, shortId, shortWallet } from "../lib/format";
import type { ReviewDecision, RewardWithdrawal } from "../types";
import { EmptyState } from "./EmptyState";
import { StatusPill } from "./StatusPill";

interface WithdrawalsReviewProps {
  isSubmitting: boolean;
  onReview: (id: string, decision: ReviewDecision, riskNote: string) => Promise<void>;
  withdrawals: RewardWithdrawal[];
}

export function WithdrawalsReview({ isSubmitting, onReview, withdrawals }: WithdrawalsReviewProps) {
  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((withdrawal) => withdrawal.status === "pending_review"),
    [withdrawals]
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(pendingWithdrawals[0]?.id);
  const selectedWithdrawal = pendingWithdrawals.find((withdrawal) => withdrawal.id === selectedId) ?? pendingWithdrawals[0];

  return (
    <section className="view-stack" aria-labelledby="withdrawals-title">
      <div className="view-heading">
        <div>
          <h2 id="withdrawals-title">奖励提现审核</h2>
          <p>通过或拒绝前必须填写风控备注，方便后续追踪。</p>
        </div>
      </div>

      <div className="review-layout">
        <section className="panel panel--table">
          <div className="panel__header">
            <div>
              <h3>待审核</h3>
              <p>{formatNumber(pendingWithdrawals.length)} 笔提现申请</p>
            </div>
          </div>
          {pendingWithdrawals.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>申请</th>
                    <th>用户</th>
                    <th>金额</th>
                    <th>钱包</th>
                    <th>创建时间</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingWithdrawals.map((withdrawal) => (
                    <tr
                      className={withdrawal.id === selectedWithdrawal?.id ? "table-row--selected" : undefined}
                      key={withdrawal.id}
                      onClick={() => setSelectedId(withdrawal.id)}
                    >
                      <td>
                        <code>{shortId(withdrawal.id)}</code>
                      </td>
                      <td>{withdrawal.userDisplayName || shortId(withdrawal.userId)}</td>
                      <td>
                        <div className="cell-stack">
                          <strong>{formatUsdc(withdrawal.usdcAmount)}</strong>
                          <span>{formatNumber(withdrawal.amountPoints)} 积分</span>
                        </div>
                      </td>
                      <td>
                        <code>{shortWallet(withdrawal.walletAddress)}</code>
                      </td>
                      <td>{formatDateTime(withdrawal.createdAt)}</td>
                      <td>
                        <StatusPill status={withdrawal.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="暂无待审核提现" detail="新的创作者奖励提现会出现在这里。" />
          )}
        </section>

        <ReviewPanel isSubmitting={isSubmitting} onReview={onReview} withdrawal={selectedWithdrawal} />
      </div>
    </section>
  );
}

interface ReviewPanelProps {
  isSubmitting: boolean;
  onReview: (id: string, decision: ReviewDecision, riskNote: string) => Promise<void>;
  withdrawal?: RewardWithdrawal;
}

function ReviewPanel({ isSubmitting, onReview, withdrawal }: ReviewPanelProps) {
  const [riskNote, setRiskNote] = useState("");
  const [localError, setLocalError] = useState<string | undefined>();

  async function submitReview(decision: ReviewDecision) {
    if (!withdrawal) {
      return;
    }

    const note = riskNote.trim();
    if (!note) {
      setLocalError("请先填写风控备注，再提交审核结果。");
      return;
    }

    setLocalError(undefined);
    await onReview(withdrawal.id, decision, note);
    setRiskNote("");
  }

  return (
    <aside className="review-panel">
      {withdrawal ? (
        <>
          <div className="review-panel__header">
            <span>当前申请</span>
            <code>{shortId(withdrawal.id)}</code>
          </div>
          <dl className="detail-list">
            <div>
              <dt>用户</dt>
              <dd>{withdrawal.userDisplayName || withdrawal.userId || "--"}</dd>
            </div>
            <div>
              <dt>钱包</dt>
              <dd>{withdrawal.walletAddress || "--"}</dd>
            </div>
            <div>
              <dt>申请金额</dt>
              <dd>{formatUsdc(withdrawal.usdcAmount)}</dd>
            </div>
            <div>
              <dt>消耗积分</dt>
              <dd>{formatNumber(withdrawal.amountPoints)}</dd>
            </div>
          </dl>

          <label className="field">
            <span>风控备注</span>
            <textarea
              onChange={(event) => setRiskNote(event.target.value)}
              placeholder="记录钱包检查、异常行为、人工核验结论等。"
              rows={7}
              value={riskNote}
            />
          </label>
          {localError ? <p className="form-error">{localError}</p> : null}

          <div className="button-row">
            <button className="button button--success" disabled={isSubmitting} onClick={() => void submitReview("approved")} type="button">
              通过
            </button>
            <button className="button button--danger" disabled={isSubmitting} onClick={() => void submitReview("rejected")} type="button">
              拒绝
            </button>
          </div>
        </>
      ) : (
        <EmptyState title="选择一笔申请" detail="完成风控复核后，可通过或拒绝待处理的提现。" />
      )}
    </aside>
  );
}
