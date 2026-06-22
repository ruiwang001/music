import { BadRequestException, Injectable } from "@nestjs/common";
import { DbService } from "../../common/db/db.service";
import { getPlatformSettings } from "../../common/settings/platform-settings";
import { ClaimRewardDto } from "./dto/claim-reward.dto";

interface UserBalanceRow {
  points_balance: number;
}

interface LedgerRow {
  id: string;
  source: string;
  delta: number;
  balance_after: number;
  status: "available" | "pending" | "reserved" | "void";
  created_at: Date | string;
}

interface WithdrawalRow {
  id: string;
  amount_points: number;
  usdc_amount: string | number;
  wallet_address: string;
  status: "pending_review" | "approved" | "rejected" | "paid";
  risk_note: string | null;
  created_at: Date | string;
}

@Injectable()
export class RewardService {
  constructor(private readonly db: DbService) {}

  async getHistory(userId: string) {
    await this.db.ensureUser(userId);

    const [settings, user, ledger, withdrawals] = await Promise.all([
      getPlatformSettings(this.db),
      this.db.one<UserBalanceRow>("select points_balance from users where id = $1", [userId]),
      this.db.query<LedgerRow>(
        `select id, source, delta, balance_after, status, created_at
         from points_ledger
         where user_id = $1
         order by created_at desc
         limit 100`,
        [userId]
      ),
      this.db.query<WithdrawalRow>(
        `select id, amount_points, usdc_amount, wallet_address, status, risk_note, created_at
         from reward_withdrawals
         where user_id = $1
         order by created_at desc
         limit 50`,
        [userId]
      )
    ]);

    const earned = await this.db.one<{ lifetime_earned: string | null }>(
      `select coalesce(sum(delta) filter (where delta > 0), 0)::text as lifetime_earned
       from points_ledger
       where user_id = $1`,
      [userId]
    );
    const lifetimeEarned = Number(earned?.lifetime_earned ?? 0);

    return {
      balance: user?.points_balance ?? 0,
      lifetimeEarned,
      settings,
      ledger: ledger.map(mapLedger),
      withdrawals: withdrawals.map(mapWithdrawal)
    };
  }

  async claim(userId: string, dto: ClaimRewardDto) {
    await this.db.ensureUser(userId);
    const settings = await getPlatformSettings(this.db);

    if (dto.amountPoints < settings.minWithdrawalPoints) {
      throw new BadRequestException(`最低兑换门槛为 ${settings.minWithdrawalPoints} 积分`);
    }

    return this.db.transaction(async (client) => {
      const userResult = await client.query<UserBalanceRow>(
        `select points_balance from users where id = $1 for update`,
        [userId]
      );
      const currentBalance = userResult.rows[0]?.points_balance ?? 0;

      if (currentBalance < dto.amountPoints) {
        throw new BadRequestException("可用积分不足");
      }

      const nextBalance = currentBalance - dto.amountPoints;
      await client.query("update users set points_balance = $2 where id = $1", [userId, nextBalance]);

      const withdrawalResult = await client.query<WithdrawalRow>(
        `insert into reward_withdrawals (user_id, amount_points, usdc_amount, wallet_address, status, risk_note)
         values ($1, $2, $3, $4, 'pending_review', 'Pending risk review before USDC payout')
         returning id, amount_points, usdc_amount, wallet_address, status, risk_note, created_at`,
        [userId, dto.amountPoints, dto.amountPoints / settings.pointsPerUsdc, dto.walletAddress.trim()]
      );

      await client.query(
        `insert into points_ledger (user_id, source, source_id, delta, balance_after, status, metadata)
         values ($1, 'reward_withdrawal_request', $2, $3, $4, 'reserved', $5::jsonb)`,
        [
          userId,
          withdrawalResult.rows[0].id,
          -dto.amountPoints,
          nextBalance,
          JSON.stringify({ walletAddress: dto.walletAddress.trim() })
        ]
      );

      return mapWithdrawal(withdrawalResult.rows[0]);
    });
  }
}

function mapLedger(row: LedgerRow) {
  return {
    id: row.id,
    source: row.source,
    delta: row.delta,
    balanceAfter: row.balance_after,
    status: row.status,
    createdAt: toIso(row.created_at)
  };
}

function mapWithdrawal(row: WithdrawalRow) {
  return {
    id: row.id,
    amountPoints: row.amount_points,
    usdcAmount: Number(row.usdc_amount),
    walletAddress: row.wallet_address,
    status: row.status,
    riskNote: row.risk_note,
    createdAt: toIso(row.created_at)
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
