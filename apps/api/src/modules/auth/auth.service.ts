import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from "crypto";
import { issueSessionToken } from "../../common/auth/session-token";
import { DbService } from "../../common/db/db.service";
import { AuthDto } from "./dto/auth.dto";

const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const DEMO_LOGIN_EMAIL = process.env.DEMO_LOGIN_EMAIL ?? "test@greensonic.ai";
const DEMO_LOGIN_PASSWORD = process.env.DEMO_LOGIN_PASSWORD ?? "12345678";
const GUEST_DEFAULT_PLAN = guestDefaultPlan();
const DEMO_TASK_ID = "22222222-2222-4222-8222-222222222222";
const DEMO_SONG_ID = "33333333-3333-4333-8333-333333333333";
const DEMO_COMMENT_USER_ID = "44444444-4444-4444-8444-444444444444";
const DEMO_COMMENT_ID = "55555555-5555-4555-8555-555555555555";
const DEMO_REPLY_USER_ID = "66666666-6666-4666-8666-666666666666";
const DEMO_REPLY_ID = "77777777-7777-4777-8777-777777777777";

interface UserRow {
  id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  plan: string;
  plan_expires_at: Date | string | null;
  risk_status: string;
  points_balance: number;
  password_hash: string | null;
  created_at: Date | string;
}

interface RequestMeta {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DbService) {}

  async register(dto: AuthDto, request?: RequestMeta) {
    const email = normalizeEmail(dto.email);
    const existing = await this.db.one<UserRow>("select * from users where lower(email) = $1", [email]);
    if (existing) {
      throw new BadRequestException("这个邮箱已经注册，请直接登录。");
    }

    const user = await this.db.one<UserRow>(
      `insert into users (email, password_hash, display_name)
       values ($1, $2, $3)
       returning *`,
      [email, hashPassword(dto.password), normalizeDisplayName(dto.displayName, email)]
    );

    await this.recordUserSession(user!.id, "register", request);
    return mapAuthSession(user!);
  }

  async login(dto: AuthDto, request?: RequestMeta) {
    const email = normalizeEmail(dto.email);
    if (isDemoLogin(email, dto.password) && allowDemoLogin()) {
      return this.getOrCreateDemoSession(request);
    }

    const user = await this.db.one<UserRow>("select * from users where lower(email) = $1", [email]);
    if (!user?.password_hash || !verifyPassword(dto.password, user.password_hash)) {
      throw new UnauthorizedException("邮箱或密码不正确。");
    }

    await this.recordUserSession(user.id, "login", request);
    return mapAuthSession(user);
  }

  async guest(request?: RequestMeta) {
    const suffix = randomBytes(4).toString("hex");
    const user = await this.db.one<UserRow>(
      `insert into users (display_name, plan)
       values ($1, $2)
       returning *`,
      [`Creator ${suffix}`, GUEST_DEFAULT_PLAN]
    );

    await this.recordUserSession(user!.id, "guest", request);
    return mapAuthSession(user!);
  }

  async testAccount(request?: RequestMeta) {
    return this.getOrCreateDemoSession(request);
  }

  async getMe(userId: string, request?: RequestMeta) {
    await this.db.ensureUser(userId);
    const user = await this.db.one<UserRow>("select * from users where id = $1", [userId]);
    await this.recordUserSession(userId, "me", request);
    return mapAuthSession(user!);
  }

  private async getOrCreateDemoSession(request?: RequestMeta) {
    const user = await this.db.one<UserRow>(
      `insert into users (email, password_hash, display_name, plan, points_balance)
       values ($1, $2, 'Green Sonic 测试账号', 'creator', 1500)
       on conflict (email) do update
       set password_hash = excluded.password_hash,
           display_name = 'Green Sonic 测试账号',
           plan = 'creator',
           points_balance = greatest(users.points_balance, 1500)
       returning *`,
      [DEMO_LOGIN_EMAIL, hashPassword(DEMO_LOGIN_PASSWORD)]
    );

    await this.ensureDemoSong(user!.id);
    await this.recordUserSession(user!.id, "demo_login", request);
    return mapAuthSession(user!);
  }

  private async ensureDemoSong(userId: string) {
    const audioUrl = createDemoAudioDataUrl();
    const coverUrl = createDemoCoverDataUrl();
    const lyrics = "海风慢慢推开清晨的窗 / 咖啡香落在绿色声波上 / 我把今天唱成一片光 / 在美术馆里等下一次回响";

    await this.db.query(
      `insert into music_tasks (
         id, user_id, status, title, prompt, style, mood, lyrics, mode, lyrics_optimizer,
         minimax_model, minimax_trace_id, minimax_status_code, estimated_cost_cents,
         completed_at, created_at, updated_at
       )
       values (
         $1, $2, 'succeeded', '海边咖啡', '海边喝咖啡，绿色极光像海浪一样慢慢铺开。',
         'Ambient', '自由', $3, 'vocal', true,
         'demo-seeded-song', 'demo-trace-green-sonic', 200, 0,
         now(), now(), now()
       )
       on conflict (id) do update
       set user_id = excluded.user_id,
           status = 'succeeded',
           title = excluded.title,
           prompt = excluded.prompt,
           style = excluded.style,
           mood = excluded.mood,
           lyrics = excluded.lyrics,
           mode = excluded.mode,
           lyrics_optimizer = excluded.lyrics_optimizer,
           completed_at = coalesce(music_tasks.completed_at, now()),
           updated_at = now()`,
      [DEMO_TASK_ID, userId, lyrics]
    );

    await this.db.query(
      `insert into songs (
         id, task_id, user_id, title, theme, style, mood, lyrics, audio_url, audio_storage_key,
         cover_url, cover_storage_key, duration_seconds, mode, visibility,
         likes_count, favorites_count, view_count, play_count, comments_count, published_at, created_at, updated_at
       )
       values (
         $1, $2, $3, '海边咖啡', '海边喝咖啡，绿色极光像海浪一样慢慢铺开。',
         'Ambient', '自由', $4, $5, 'demo/green-sonic-test-song.wav',
         $6, 'demo/green-sonic-test-cover.svg', 4, 'vocal', 'public',
         18, 6, 128, 42, 2, now(), now(), now()
       )
       on conflict (id) do update
       set user_id = excluded.user_id,
           task_id = excluded.task_id,
           title = excluded.title,
           theme = excluded.theme,
           style = excluded.style,
           mood = excluded.mood,
           lyrics = excluded.lyrics,
           audio_url = excluded.audio_url,
           audio_storage_key = excluded.audio_storage_key,
           cover_url = excluded.cover_url,
           cover_storage_key = excluded.cover_storage_key,
           duration_seconds = excluded.duration_seconds,
           mode = excluded.mode,
           visibility = 'public',
           likes_count = greatest(songs.likes_count, excluded.likes_count),
           favorites_count = greatest(songs.favorites_count, excluded.favorites_count),
           view_count = greatest(songs.view_count, excluded.view_count),
           play_count = greatest(songs.play_count, excluded.play_count),
           published_at = coalesce(songs.published_at, now()),
           updated_at = now()`,
      [DEMO_SONG_ID, DEMO_TASK_ID, userId, lyrics, audioUrl, coverUrl]
    );

    await this.db.query(
      `insert into users (id, display_name)
       values ($1, 'Aurora Listener'), ($2, 'Gallery Curator')
       on conflict (id) do nothing`,
      [DEMO_COMMENT_USER_ID, DEMO_REPLY_USER_ID]
    );

    await this.db.query(
      `insert into comments (id, user_id, song_id, body, likes_count, created_at)
       values
         ($1, $2, $3, '这首很适合做分享页和评论交互测试，氛围很完整。', 5, now() - interval '2 hours'),
         ($4, $5, $3, '封面、播放、评论、分享都可以从这首歌开始调。', 3, now() - interval '38 minutes')
       on conflict (id) do update
       set body = excluded.body,
           likes_count = greatest(comments.likes_count, excluded.likes_count)`,
      [DEMO_COMMENT_ID, DEMO_COMMENT_USER_ID, DEMO_SONG_ID, DEMO_REPLY_ID, DEMO_REPLY_USER_ID]
    );

    await this.db.query(
      `update songs
       set comments_count = (
             select count(*)::integer
             from comments
             where song_id = $1
           ),
           updated_at = now()
       where id = $1`,
      [DEMO_SONG_ID]
    );
  }

  private async recordUserSession(userId: string, sessionType: string, request?: RequestMeta) {
    try {
      await this.db.ensureRuntimeSchema();
      const userAgent = readHeader(request?.headers, "user-agent")?.slice(0, 500) ?? null;
      const platform = normalizePlatform(readHeader(request?.headers, "sec-ch-ua-platform"), userAgent);
      const ipAddress = readClientIp(request);
      const fingerprint = createHash("sha256")
        .update(`${platform ?? "unknown"}|${userAgent ?? "unknown"}|${ipAddress ?? "unknown"}`)
        .digest("hex");

      await this.db.query(
        `insert into user_sessions (user_id, session_fingerprint, session_type, platform, user_agent, ip_address)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, session_fingerprint) do update
         set session_type = excluded.session_type,
             platform = coalesce(excluded.platform, user_sessions.platform),
             user_agent = coalesce(excluded.user_agent, user_sessions.user_agent),
             ip_address = coalesce(excluded.ip_address, user_sessions.ip_address),
             request_count = user_sessions.request_count + 1,
             last_seen_at = now()`,
        [userId, fingerprint, sessionType, platform, userAgent, ipAddress]
      );
    } catch (error) {
      console.warn("[auth-session-tracking]", error);
    }
  }
}

function readHeader(headers: Record<string, string | string[] | undefined> | undefined, key: string): string | null {
  const raw = headers?.[key] ?? headers?.[key.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || null;
}

function readClientIp(request?: RequestMeta): string | null {
  const forwarded = readHeader(request?.headers, "x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || readHeader(request?.headers, "cf-connecting-ip") || request?.ip || request?.socket?.remoteAddress || null;
}

function normalizePlatform(rawPlatform: string | null, userAgent: string | null): string | null {
  const cleaned = rawPlatform?.replace(/"/g, "").trim();
  if (cleaned) {
    return cleaned.slice(0, 80);
  }

  const ua = userAgent?.toLowerCase() ?? "";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) {
    return "iOS";
  }
  if (ua.includes("android")) {
    return "Android";
  }
  if (ua.includes("mac")) {
    return "macOS";
  }
  if (ua.includes("windows")) {
    return "Windows";
  }
  return userAgent ? "Web" : null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string | undefined, email: string): string {
  const trimmed = displayName?.trim();
  if (trimmed) {
    return trimmed.slice(0, 40);
  }
  return email.split("@")[0]?.slice(0, 28) || "Creator";
}

function isDemoLogin(email: string, password: string): boolean {
  return email === normalizeEmail(DEMO_LOGIN_EMAIL) && password === DEMO_LOGIN_PASSWORD;
}

function allowDemoLogin(): boolean {
  return process.env.ALLOW_DEMO_LOGIN === "true" || process.env.NODE_ENV !== "production";
}

function guestDefaultPlan(): "free" | "pro" | "creator" {
  const configured = process.env.GUEST_DEFAULT_PLAN?.trim().toLowerCase();
  if (configured === "free" || configured === "pro" || configured === "creator") {
    return configured;
  }

  return "free";
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString("hex");
  return `pbkdf2_${PASSWORD_DIGEST}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, iterationsRaw, salt, expectedHash] = stored.split("$");
  if (algorithm !== `pbkdf2_${PASSWORD_DIGEST}` || !iterationsRaw || !salt || !expectedHash) {
    return false;
  }

  const actual = pbkdf2Sync(password, salt, Number(iterationsRaw), PASSWORD_KEY_LENGTH, PASSWORD_DIGEST);
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function mapAuthSession(user: UserRow) {
  return {
    token: issueSessionToken({ userId: user.id, email: user.email }),
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      plan: user.plan,
      planExpiresAt: user.plan_expires_at ? toIso(user.plan_expires_at) : null,
      riskStatus: user.risk_status,
      pointsBalance: user.points_balance,
      createdAt: toIso(user.created_at)
    }
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function createDemoAudioDataUrl(): string {
  const sampleRate = 8000;
  const seconds = 4;
  const samples = sampleRate * seconds;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.sin((Math.PI * index) / samples);
    const baseTone = Math.sin((2 * Math.PI * 246.94 * index) / sampleRate);
    const overtone = Math.sin((2 * Math.PI * 392 * index) / sampleRate) * 0.45;
    const shimmer = Math.sin((2 * Math.PI * 523.25 * index) / sampleRate) * 0.18;
    const tone = (baseTone + overtone + shimmer) * 0.16 * envelope;
    buffer.writeInt16LE(Math.round(tone * 32767), 44 + index * 2);
  }

  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

function createDemoCoverDataUrl(): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <defs>
    <radialGradient id="aurora" cx="38%" cy="30%" r="76%">
      <stop offset="0%" stop-color="#a8ffd8"/>
      <stop offset="38%" stop-color="#59ffc8"/>
      <stop offset="72%" stop-color="#0b5f49"/>
      <stop offset="100%" stop-color="#041a15"/>
    </radialGradient>
    <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff1b8"/>
      <stop offset="100%" stop-color="#ffd87a"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="18" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="800" height="800" rx="96" fill="url(#aurora)"/>
  <path d="M46 540 C210 400 280 628 440 442 S655 308 754 458" fill="none" stroke="#a8ffd8" stroke-width="46" stroke-linecap="round" opacity=".55" filter="url(#glow)"/>
  <path d="M42 604 C220 500 330 676 512 520 C616 430 700 430 758 498" fill="none" stroke="url(#gold)" stroke-width="18" stroke-linecap="round" opacity=".82"/>
  <circle cx="400" cy="382" r="144" fill="#02110d" opacity=".9"/>
  <circle cx="400" cy="382" r="62" fill="url(#gold)"/>
  <circle cx="400" cy="382" r="228" fill="none" stroke="#a8ffd8" stroke-width="3" opacity=".28"/>
  <text x="76" y="690" fill="#f4f1e8" font-family="Inter, Arial, sans-serif" font-size="54" font-weight="800">海边咖啡</text>
  <text x="78" y="736" fill="#bfe8c5" font-family="Inter, Arial, sans-serif" font-size="26">Green Sonic Gallery · Demo Song</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}
