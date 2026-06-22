# Melody AI Music Platform

This repository is a full-stack PWA AI music creation product:

- User app: React / Vite PWA
- Backend: NestJS / Node.js
- Database: PostgreSQL / Supabase
- Storage: S3 or Cloudflare R2
- AI music: server-side MiniMax Music API wrapper plus MiniMax album-cover generation
- Payments: subscription and purchase verification APIs; native-store clients can be added later if needed
- Rewards: internal Melody Points with risk review before USDC withdrawal
- Admin: lightweight React dashboard for moderation, withdrawals, challenges, and task audits

## Project Structure

```text
.
├── apps
│   ├── api
│   │   ├── src/common          # auth, database, storage, MiniMax integrations
│   │   ├── src/modules         # music, feed, rewards, IAP, challenges, admin
│   │   └── src/main.ts
│   ├── pwa
│   │   └── src                 # Green Sonic Gallery user-facing PWA
│   └── admin
│       └── src                 # moderation/admin dashboard
├── packages
│   └── shared                  # shared enums, DTOs, and domain types
├── infra
│   └── supabase/schema.sql     # schema, indexes, RLS-ready tables, seed challenge
├── docs
│   ├── architecture.md
│   └── api.md
└── .env.example
```

## Quick Start

1. Copy `.env.example` into each app as needed, then fill real secrets on the server only.
2. Apply `infra/supabase/schema.sql` to your Supabase/PostgreSQL database, start the bundled local database with `docker compose -f infra/docker-compose.yml up -d`, or use the no-Docker local fallback by setting `DATABASE_URL=pglite://./.pglite`.
3. Install dependencies with `npm install`.
4. Start the backend with `npm run dev:api`.
5. Start the PWA with `npm run dev:pwa` or the default `npm run dev`.
6. Start the admin dashboard with `npm run dev:admin`.

The PWA never stores MiniMax, S3/R2, payment private keys, or admin keys.

## MVP Test Flow

The PWA MVP creates a signed guest creator identity automatically. In production, guests default to the Free plan; test scripts that need multi-song Creator privileges set `GUEST_DEFAULT_PLAN=creator` explicitly.

1. Open the PWA and submit the Home generator form.
2. Confirm the Generating page receives a queued task immediately, then polls until success or a clear failure message.
3. Confirm Song Detail shows generated audio plus a cover image. If MiniMax cover generation fails in development, the backend uploads a local Green Sonic Aurora fallback cover.
4. Open Song Detail, add a comment, share/open audio, then publish to the community.
5. Open Gallery, refresh, like, favorite, and open a public song.
6. Open Challenge, select your generated song from Profile/Detail, then submit it.
7. Open Rewards, refresh history, and submit a USDC withdrawal request.
8. Open Membership and run the sandbox StoreKit verification flow.
9. Open Admin, refresh overview, inspect MiniMax tasks, review a withdrawal, and create a challenge.

Useful QA commands:

- `npm run qa:schema` validates a clean database initialization.
- `npm run qa:guest` validates no-login guest identity.
- `npm run qa:auth` validates production bearer-token enforcement.
- `npm run qa:iap` validates that fake/sandbox IAP payloads are rejected in production mode.
- `npm run qa:multi-publish` validates multi-song publish, feed, likes, favorites, comments, comment likes, follows, and anti-duplicate view/play counts.
- `npm run qa:challenge-reward` validates challenge submission, leaderboard, reward claim, admin review, and point refund.
- `npm run qa:core:repeat` runs the core mocked generation flow repeatedly.
- `npm run qa:online` checks the deployed PWA/API without triggering MiniMax generation.

Local development fallback:

- If `MINIMAX_API_KEY` is empty or `change-me`, the API creates a short local WAV and local PNG cover so the generation flow can be tested.
- If `S3_BUCKET` is empty outside production, generated audio and covers are returned as data URLs.
- If `DATABASE_URL` starts with `pglite://`, the API uses an embedded local Postgres-compatible database for development only.
- Real MiniMax music generation can take several minutes, so the backend runs it in the background and the PWA polls `GET /api/music/task/:id`.
- Production must configure MiniMax, S3/R2, payment verification, and real authentication.
