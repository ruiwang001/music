import { Body, Controller, Get, Post } from "@nestjs/common";
import { CurrentUser as CurrentUserDecorator, type CurrentUser } from "../../common/auth/current-user.decorator";
import { ClaimRewardDto } from "./dto/claim-reward.dto";
import { RewardService } from "./reward.service";

@Controller("reward")
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  @Get("history")
  getHistory(@CurrentUserDecorator() user: CurrentUser) {
    return this.rewardService.getHistory(user.id);
  }

  @Post("claim")
  claim(@CurrentUserDecorator() user: CurrentUser, @Body() dto: ClaimRewardDto) {
    return this.rewardService.claim(user.id, dto);
  }
}
