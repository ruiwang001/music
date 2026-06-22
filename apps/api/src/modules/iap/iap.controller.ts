import { Body, Controller, Post } from "@nestjs/common";
import { CurrentUser as CurrentUserDecorator, type CurrentUser } from "../../common/auth/current-user.decorator";
import { VerifyIapDto } from "./dto/verify-iap.dto";
import { IapService } from "./iap.service";

@Controller("iap")
export class IapController {
  constructor(private readonly iapService: IapService) {}

  @Post("verify")
  verify(@CurrentUserDecorator() user: CurrentUser, @Body() dto: VerifyIapDto) {
    return this.iapService.verify(user.id, dto);
  }
}
