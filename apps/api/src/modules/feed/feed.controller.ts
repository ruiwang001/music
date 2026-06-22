import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser as CurrentUserDecorator, type CurrentUser } from "../../common/auth/current-user.decorator";
import { ToggleFollowDto } from "./dto/toggle-follow.dto";
import { ToggleSongReactionDto } from "./dto/toggle-song-reaction.dto";
import { FeedService } from "./feed.service";

@Controller()
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get("feed")
  getFeed(@CurrentUserDecorator() user: CurrentUser) {
    return this.feedService.getFeed(user.id);
  }

  @Post("like")
  toggleLike(@CurrentUserDecorator() user: CurrentUser, @Body() dto: ToggleSongReactionDto) {
    return this.feedService.toggleReaction(user.id, dto.songId, "like", dto.liked ?? true);
  }

  @Post("favorite")
  toggleFavorite(@CurrentUserDecorator() user: CurrentUser, @Body() dto: ToggleSongReactionDto) {
    return this.feedService.toggleReaction(user.id, dto.songId, "favorite", dto.favorited ?? true);
  }

  @Get("creators/:id")
  getCreator(@CurrentUserDecorator() user: CurrentUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.feedService.getCreatorProfile(user.id, id);
  }

  @Post("follow")
  toggleFollow(@CurrentUserDecorator() user: CurrentUser, @Body() dto: ToggleFollowDto) {
    return this.feedService.toggleFollow(user.id, dto.creatorId, dto.following ?? true);
  }
}
