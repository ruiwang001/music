import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser as CurrentUserDecorator, type CurrentUser } from "../../common/auth/current-user.decorator";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { CreateMvTaskDto } from "./dto/create-mv-task.dto";
import { GenerateMusicDto } from "./dto/generate-music.dto";
import { PublishSongDto } from "./dto/publish-song.dto";
import { ToggleCommentLikeDto } from "./dto/toggle-comment-like.dto";
import { MusicService } from "./music.service";

@Controller()
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Post("music/generate")
  generate(@CurrentUserDecorator() user: CurrentUser, @Body() dto: GenerateMusicDto) {
    return this.musicService.generate(user.id, dto);
  }

  @Get("music/tasks")
  getMyTasks(@CurrentUserDecorator() user: CurrentUser) {
    return this.musicService.getMyTasks(user.id);
  }

  @Post("music/mv/generate")
  createMvTask(@CurrentUserDecorator() user: CurrentUser, @Body() dto: CreateMvTaskDto) {
    return this.musicService.createMvTask(user.id, dto);
  }

  @Get("music/mv/tasks")
  getMyMvTasks(@CurrentUserDecorator() user: CurrentUser) {
    return this.musicService.getMyMvTasks(user.id);
  }

  @Get("music/mv/task/:id")
  getMvTask(@CurrentUserDecorator() user: CurrentUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.musicService.getMvTask(user.id, id);
  }

  @Get("music/my-songs")
  getMySongs(@CurrentUserDecorator() user: CurrentUser) {
    return this.musicService.getMySongs(user.id);
  }

  @Get("music/song/:id")
  getSong(@CurrentUserDecorator() user: CurrentUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.musicService.getSong(user.id, id);
  }

  @Get("music/task/:id")
  getTask(@CurrentUserDecorator() user: CurrentUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.musicService.getTask(user.id, id);
  }

  @Post("music/publish")
  publish(@CurrentUserDecorator() user: CurrentUser, @Body() dto: PublishSongDto) {
    return this.musicService.publish(user.id, dto);
  }

  @Post("music/song/:id/view")
  recordView(@CurrentUserDecorator() user: CurrentUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.musicService.recordView(user.id, id);
  }

  @Post("music/song/:id/play")
  recordPlay(@CurrentUserDecorator() user: CurrentUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.musicService.recordPlay(user.id, id);
  }

  @Get("songs/:id/comments")
  getComments(@CurrentUserDecorator() user: CurrentUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.musicService.getComments(user.id, id);
  }

  @Post("comment")
  createComment(@CurrentUserDecorator() user: CurrentUser, @Body() dto: CreateCommentDto) {
    return this.musicService.createComment(user.id, dto);
  }

  @Post("comment/:id/like")
  toggleCommentLike(@CurrentUserDecorator() user: CurrentUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ToggleCommentLikeDto) {
    return this.musicService.toggleCommentLike(user.id, id, dto);
  }
}
