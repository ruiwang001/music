import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AdminKeyGuard } from "../../common/auth/admin-key.guard";
import { AdminService } from "./admin.service";
import { CreateChallengeDto } from "./dto/create-challenge.dto";
import { ReviewWithdrawalDto } from "./dto/review-withdrawal.dto";
import { UpdatePlatformSettingsDto } from "./dto/update-platform-settings.dto";
import { UpdateSongAdminDto } from "./dto/update-song-admin.dto";

@Controller("admin")
@UseGuards(AdminKeyGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("overview")
  overview() {
    return this.adminService.getOverview();
  }

  @Get("music-tasks")
  musicTasks() {
    return this.adminService.getMusicTasks();
  }

  @Get("users")
  users() {
    return this.adminService.getUsers();
  }

  @Get("songs")
  songs() {
    return this.adminService.getSongs();
  }

  @Patch("songs/:id")
  updateSong(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateSongAdminDto) {
    return this.adminService.updateSong(id, dto);
  }

  @Get("settings")
  settings() {
    return this.adminService.getSettings();
  }

  @Patch("settings")
  updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
    return this.adminService.updateSettings(dto);
  }

  @Get("withdrawals")
  withdrawals(@Query("status") status?: string) {
    return this.adminService.getWithdrawals(status);
  }

  @Post("withdrawals/:id/review")
  reviewWithdrawal(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ReviewWithdrawalDto) {
    return this.adminService.reviewWithdrawal(id, dto);
  }

  @Get("challenges")
  challenges() {
    return this.adminService.getChallenges();
  }

  @Post("challenges")
  createChallenge(@Body() dto: CreateChallengeDto) {
    return this.adminService.createChallenge(dto);
  }
}
