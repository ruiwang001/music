import { DbService } from "../db/db.service";

export interface PlatformSettings {
  pointsPerUsdc: number;
  minWithdrawalPoints: number;
  publishRewardPoints: number;
  updatedAt?: string | null;
}

export interface PlatformSettingsInput {
  pointsPerUsdc?: number;
  minWithdrawalPoints?: number;
  publishRewardPoints?: number;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  pointsPerUsdc: 10,
  minWithdrawalPoints: 10,
  publishRewardPoints: 25,
  updatedAt: null
};

const SETTING_KEYS = {
  pointsPerUsdc: "points_per_usdc",
  minWithdrawalPoints: "min_withdrawal_points",
  publishRewardPoints: "publish_reward_points"
} as const;

interface SettingRow {
  key: string;
  value: string;
  updated_at: Date | string;
}

export async function getPlatformSettings(db: DbService): Promise<PlatformSettings> {
  await db.ensureRuntimeSchema();
  const rows = await db.query<SettingRow>(
    `select key, value, updated_at
     from app_settings
     where key in ($1, $2, $3)`,
    [SETTING_KEYS.pointsPerUsdc, SETTING_KEYS.minWithdrawalPoints, SETTING_KEYS.publishRewardPoints]
  );

  const settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    const numericValue = Number(row.value);
    if (!Number.isFinite(numericValue)) {
      continue;
    }
    if (row.key === SETTING_KEYS.pointsPerUsdc) {
      settings.pointsPerUsdc = numericValue;
    }
    if (row.key === SETTING_KEYS.minWithdrawalPoints) {
      settings.minWithdrawalPoints = numericValue;
    }
    if (row.key === SETTING_KEYS.publishRewardPoints) {
      settings.publishRewardPoints = numericValue;
    }
    settings.updatedAt = toIso(row.updated_at);
  }

  return settings;
}

export async function updatePlatformSettings(db: DbService, input: PlatformSettingsInput): Promise<PlatformSettings> {
  await db.ensureRuntimeSchema();
  const entries = [
    [SETTING_KEYS.pointsPerUsdc, input.pointsPerUsdc],
    [SETTING_KEYS.minWithdrawalPoints, input.minWithdrawalPoints],
    [SETTING_KEYS.publishRewardPoints, input.publishRewardPoints]
  ] as const;

  for (const [key, value] of entries) {
    if (typeof value !== "number") {
      continue;
    }
    await db.query(
      `insert into app_settings (key, value, updated_at)
       values ($1, $2, now())
       on conflict (key) do update
       set value = excluded.value,
           updated_at = now()`,
      [key, String(value)]
    );
  }

  return getPlatformSettings(db);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
