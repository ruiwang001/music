import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser as CurrentUserDecorator, type CurrentUser } from "../../common/auth/current-user.decorator";
import { ChallengesService } from "./challenges.service";
import { SubmitChallengeDto } from "./dto/submit-challenge.dto";

@Controller("challenges")
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Get("daily")
  getDaily(@CurrentUserDecorator() user: CurrentUser) {
    return this.challengesService.getDaily(user.id);
  }

  @Post(":id/submit")
  submit(
    @CurrentUserDecorator() user: CurrentUser,
    @Param("id", ParseUUIDPipe) challengeId: string,
    @Body() dto: SubmitChallengeDto
  ) {
    return this.challengesService.submit(user.id, challengeId, dto.songId);
  }
}
