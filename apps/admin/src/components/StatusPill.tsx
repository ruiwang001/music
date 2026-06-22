import type { TaskStatus, WithdrawalStatus } from "../types";

type Status = TaskStatus | WithdrawalStatus | "active" | "inactive" | "public" | "private";

interface StatusPillProps {
  status: Status;
}

const labelByStatus: Record<Status, string> = {
  queued: "排队中",
  generating: "生成中",
  succeeded: "成功",
  failed: "失败",
  pending_review: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
  paid: "已打款",
  active: "进行中",
  inactive: "已结束",
  public: "公开",
  private: "私密"
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill--${status}`}>
      <span className="status-pill__dot" />
      {labelByStatus[status]}
    </span>
  );
}
