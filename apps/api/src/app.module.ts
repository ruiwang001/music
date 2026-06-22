import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DbModule } from "./common/db/db.module";
import { MiniMaxModule } from "./common/minimax/minimax.module";
import { StorageModule } from "./common/storage/storage.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChallengesModule } from "./modules/challenges/challenges.module";
import { FeedModule } from "./modules/feed/feed.module";
import { HealthModule } from "./modules/health/health.module";
import { IapModule } from "./modules/iap/iap.module";
import { MusicModule } from "./modules/music/music.module";
import { RewardModule } from "./modules/reward/reward.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    DbModule,
    StorageModule,
    AuthModule,
    HealthModule,
    MiniMaxModule,
    MusicModule,
    FeedModule,
    RewardModule,
    IapModule,
    ChallengesModule,
    AdminModule
  ]
})
export class AppModule {}
