# Architecture

## Runtime Flow

1. The iOS app calls `POST /api/music/generate` with prompt, style, mood, lyrics, and vocal/instrumental mode.
2. The NestJS API checks the user's plan quota and content constraints.
3. A `music_tasks` row is created with full audit fields.
4. The backend calls MiniMax Music API from the server, logs request cost/status/error into `minimax_api_logs`, and stores generated media in S3/R2.
5. The backend creates a private `songs` row and marks the task as `succeeded`.
6. The app polls `GET /api/music/task/:id` and opens the details page when the song is ready.
7. Publishing a song changes visibility and awards Melody Points through an append-only `points_ledger`.
8. Rewards are requested through `POST /api/reward/claim` and held as `pending_review` until an admin approves or rejects them.
9. Apple purchases are verified on the backend using StoreKit 2 signed transaction data, then persisted into `iap_orders` and reflected on `users.plan`.

The current PWA MVP skips the manual login screen. On first launch it creates a signed guest session with `POST /api/auth/guest`; production guests default to the Free plan. Generated songs can be published to a vertical music feed, shared through deep links, commented on, favorited, liked, and attached to creator profiles.

## Security Notes

- MiniMax API keys are server-only.
- S3/R2 keys are server-only.
- Admin endpoints require `X-Admin-Key`.
- User endpoints accept signed bearer sessions. `X-User-Id` is only a local development fallback and is rejected in production by default.
- Reward withdrawals never become payable before risk review.
- Failed MiniMax generations are marked refunded and do not count against generation quota.
- The backend rejects reference-audio upload URLs to reduce copyright risk.
- View and play counters are backed by per-user event tables so repeated taps by the same user do not inflate counts.
