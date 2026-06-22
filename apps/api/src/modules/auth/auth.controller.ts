import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { CurrentUser as CurrentUserDecorator, type CurrentUser } from "../../common/auth/current-user.decorator";
import { AuthService } from "./auth.service";
import { AuthDto } from "./dto/auth.dto";

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/register")
  register(@Body() dto: AuthDto, @Req() request: RequestLike) {
    return this.authService.register(dto, request);
  }

  @Post("auth/login")
  login(@Body() dto: AuthDto, @Req() request: RequestLike) {
    return this.authService.login(dto, request);
  }

  @Post("auth/guest")
  guest(@Req() request: RequestLike) {
    return this.authService.guest(request);
  }

  @Post("auth/test-account")
  testAccount(@Req() request: RequestLike) {
    return this.authService.testAccount(request);
  }

  @Get("me")
  me(@CurrentUserDecorator() user: CurrentUser, @Req() request: RequestLike) {
    return this.authService.getMe(user.id, request);
  }
}
