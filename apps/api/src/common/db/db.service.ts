import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { dirname, resolve } from "path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, PoolClient, QueryResultRow } from "pg";

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly databaseConfig = resolveDatabaseConfig();
  private readonly usePglite = shouldUsePglite(this.databaseConfig.url);
  private readonly pool = this.usePglite
    ? null
    : new Pool({
        connectionString: this.databaseConfig.url,
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
      });
  private readonly pglite = this.usePglite ? new PGlite(pgliteDataDir(this.databaseConfig.url)) : null;
  private pgliteSchemaReady?: Promise<void>;
  private runtimeSchemaReady?: Promise<void>;

  diagnostics(): DatabaseDiagnostics {
    const kind = databaseUrlKind(this.databaseConfig.url);
    const warning = databaseWarning(kind, this.usePglite);

    return {
      driver: this.usePglite ? "pglite" : "postgres",
      urlKind: kind,
      envSource: this.databaseConfig.source ?? "none",
      persistent: !this.usePglite && kind !== "missing",
      warning
    };
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    if (this.pglite) {
      await this.ensurePgliteSchema();
      const result = await this.pglite.query<T>(text, params);
      return result.rows;
    }

    const result = await this.pool!.query<T>(text, params);
    return result.rows;
  }

  async one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async transaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    if (this.pglite) {
      await this.ensurePgliteSchema();
      return this.pglite.transaction((client) => handler(client as unknown as PoolClient));
    }

    const client = await this.pool!.connect();
    try {
      await client.query("begin");
      const result = await handler(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureUser(userId: string): Promise<void> {
    await this.query(
      `insert into users (id, display_name)
       values ($1, 'Creator')
       on conflict (id) do nothing`,
      [userId]
    );
  }

  async ensureRuntimeSchema(): Promise<void> {
    this.runtimeSchemaReady ??= this.createRuntimeSchema();
    await this.runtimeSchemaReady;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pglite) {
      await this.pglite.close();
      return;
    }

    await this.pool!.end();
  }

  private async ensurePgliteSchema(): Promise<void> {
    this.pgliteSchemaReady ??= initializePgliteSchema(this.pglite!);
    await this.pgliteSchemaReady;
  }

  private async createRuntimeSchema(): Promise<void> {
    await this.query(
      `create table if not exists app_settings (
         key text primary key,
         value text not null,
         description text,
         updated_at timestamptz not null default now()
       )`
    );
    await this.query(
      `insert into app_settings (key, value, description)
       values
         ('points_per_usdc', '10', 'Melody Points required for 1 USDC'),
         ('min_withdrawal_points', '10', 'Minimum points allowed for one USDC withdrawal request'),
         ('publish_reward_points', '25', 'Points awarded when a song is first published')
       on conflict (key) do nothing`
    );
    await this.query(
      `create table if not exists user_sessions (
         id uuid primary key default gen_random_uuid(),
         user_id uuid not null references users(id) on delete cascade,
         session_fingerprint text not null,
         session_type text not null default 'app',
         platform text,
         user_agent text,
         ip_address text,
         request_count integer not null default 1,
         first_seen_at timestamptz not null default now(),
         last_seen_at timestamptz not null default now(),
         created_at timestamptz not null default now(),
         unique (user_id, session_fingerprint)
       )`
    );
    await this.query("create index if not exists idx_user_sessions_last_seen on user_sessions(last_seen_at desc)");
    await this.query("create index if not exists idx_user_sessions_user_last_seen on user_sessions(user_id, last_seen_at desc)");
  }
}

type DatabaseConfig = {
  source?: string;
  url?: string;
};

type DatabaseDiagnostics = {
  driver: "postgres" | "pglite";
  urlKind: "postgres" | "pglite" | "custom" | "missing";
  envSource: string;
  persistent: boolean;
  warning?: string;
};

function resolveDatabaseConfig(): DatabaseConfig {
  const candidates: Array<[string, string | undefined]> = [
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["POSTGRES_URL", process.env.POSTGRES_URL],
    ["POSTGRES_PRISMA_URL", process.env.POSTGRES_PRISMA_URL],
    ["POSTGRES_URL_NON_POOLING", process.env.POSTGRES_URL_NON_POOLING]
  ];

  const match = candidates.find(([, value]) => Boolean(value?.trim()));
  return match ? { source: match[0], url: match[1]!.trim() } : {};
}

function shouldUsePglite(databaseUrl?: string): boolean {
  return process.env.DATABASE_DRIVER === "pglite" || Boolean(databaseUrl?.startsWith("pglite://"));
}

function databaseUrlKind(databaseUrl?: string): DatabaseDiagnostics["urlKind"] {
  if (!databaseUrl) {
    return "missing";
  }

  if (databaseUrl.startsWith("pglite://")) {
    return "pglite";
  }

  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    return "postgres";
  }

  return "custom";
}

function databaseWarning(kind: DatabaseDiagnostics["urlKind"], usePglite: boolean): string | undefined {
  if (usePglite) {
    return "PGlite is not persistent in serverless production. Use a hosted PostgreSQL DATABASE_URL/POSTGRES_URL.";
  }

  if (kind === "missing") {
    return "No database URL is configured. Set DATABASE_URL or POSTGRES_URL to a hosted PostgreSQL database.";
  }

  return undefined;
}

function pgliteDataDir(databaseUrl?: string): string | undefined {
  const root = projectRoot();

  if (databaseUrl?.startsWith("pglite://")) {
    const configuredPath = databaseUrl.slice("pglite://".length);
    if (!configuredPath || configuredPath === ":memory:") {
      return undefined;
    }

    return resolve(root, configuredPath);
  }

  const configuredPath = process.env.PGLITE_DATA_DIR;
  return configuredPath ? resolve(root, configuredPath) : resolve(root, ".pglite");
}

async function initializePgliteSchema(db: PGlite): Promise<void> {
  await db.exec(
    `do $$ begin
       create function gen_random_uuid()
       returns uuid
       language sql
       as $fn$select md5(random()::text || clock_timestamp()::text)::uuid$fn$;
     exception when duplicate_function then null;
     end $$`
  );

  const schemaPath = findSchemaPath();
  const schema = (await readFile(schemaPath, "utf8")).replace(/create extension if not exists "pgcrypto";\s*/, "");
  await db.exec(schema);
}

function findSchemaPath(): string {
  const candidates = [
    resolve(process.cwd(), "infra/supabase/schema.sql"),
    resolve(process.cwd(), "../../infra/supabase/schema.sql"),
    resolve(__dirname, "../../../../infra/supabase/schema.sql"),
    resolve(__dirname, "../../../../../infra/supabase/schema.sql")
  ];

  const schemaPath = candidates.find((candidate) => existsSync(candidate));
  if (!schemaPath) {
    throw new Error("Unable to locate infra/supabase/schema.sql for PGlite initialization");
  }

  return schemaPath;
}

function projectRoot(): string {
  return dirname(dirname(dirname(findSchemaPath())));
}
