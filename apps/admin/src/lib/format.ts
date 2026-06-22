export function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatCurrencyFromCents(cents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(cents / 100);
}

export function formatUsdc(value: number): string {
  return `${new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)} USDC`;
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return "从未";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDuration(ms?: number): string {
  if (!ms || ms < 0) {
    return "--";
  }

  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }

  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "少于 1 分钟";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} 分钟`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return `${hours.toFixed(1)} 小时`;
  }
  return `${(hours / 24).toFixed(1)} 天`;
}

export function shortId(value?: string): string {
  if (!value) {
    return "--";
  }

  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function shortWallet(value: string): string {
  if (value.length <= 18) {
    return value || "--";
  }

  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function toInputDateTime(value: Date): string {
  const offset = value.getTimezoneOffset();
  const local = new Date(value.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
