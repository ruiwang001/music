# API

All user endpoints require `X-User-Id`. The PWA stores the returned user id locally after guest identity creation and sends it on later requests. Admin endpoints require `X-Admin-Key`.

PWA MVP note: the current web app creates a signed guest session automatically through `POST /api/auth/guest`, then sends `Authorization: Bearer <token>` on later requests. Production rejects insecure `X-User-Id` headers unless explicitly enabled for local development.

## Health

- `GET /api/health` returns deployment health without exposing secrets.

## Auth

- `POST /api/auth/register` creates an email creator account.
  - Body: `{ "email": "creator@example.com", "password": "password123", "displayName": "Mira" }`
  - Returns: `{ "user": { "id", "email", "displayName", "plan", "riskStatus", "pointsBalance", "createdAt" } }`
- `POST /api/auth/login` signs in with email and password and returns the same user session shape.
- `GET /api/me` returns the current `X-User-Id` user session.

## Music

- `POST /api/music/generate` creates a queued generation task and returns immediately. The backend continues MiniMax music and cover generation in the background.
- `GET /api/music/tasks` lists the current user's generation tasks.
- `GET /api/music/my-songs` lists the current user's songs.
- `GET /api/music/song/:id` returns a public song, or the current user's private song.
- `GET /api/music/task/:id` returns task and song status. When generation succeeds it includes `task.audioUrl`, `task.coverUrl`, and `task.songId`.
- `POST /api/music/publish` publishes a song to the community feed.
- `POST /api/music/song/:id/view` records one view per user/song.
- `POST /api/music/song/:id/play` records one play per user/song.
- `GET /api/songs/:id/comments` returns song comments.
- `POST /api/comment` creates a comment.
- `POST /api/comment/:id/like` likes or unlikes a comment.

## Feed

- `GET /api/feed` lists public songs.
- `POST /api/like` likes or unlikes a song.
- `POST /api/favorite` favorites or unfavorites a song.
- `GET /api/creators/:id` returns a creator profile and public songs.
- `POST /api/follow` follows or unfollows a creator.

## Challenges

- `GET /api/challenges/daily` returns the active challenge and leaderboard.
- `POST /api/challenges/:id/submit` submits a public song to a challenge.

## Rewards

- `POST /api/reward/claim` requests a USDC withdrawal from available Melody Points.
- `GET /api/reward/history` returns point ledger entries and withdrawal history.

## IAP

- `POST /api/iap/verify` verifies Apple StoreKit 2 signed transaction data and updates the user plan.

## Admin

- `GET /api/admin/overview`
- `GET /api/admin/music-tasks`
- `GET /api/admin/withdrawals`
- `POST /api/admin/withdrawals/:id/review`
- `GET /api/admin/challenges`
- `POST /api/admin/challenges`
