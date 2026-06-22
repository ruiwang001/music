import { Module } from "@nestjs/common";
import { RewardController } from "./reward.controller";
import { RewardService } from "./reward.service";

@Module({
  controllers: [RewardController],
  providers: [RewardService],
  exports: [RewardService]
})
export class RewardModule {}
