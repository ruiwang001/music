import { Controller, Get } from "@nestjs/common";
import { DbService } from "../../common/db/db.service";

@Controller("health")
export class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  health() {
    return {
      status: "ok",
      service: "green-sonic-api",
      environment: process.env.NODE_ENV ?? "development",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
      database: this.db.diagnostics(),
      timestamp: new Date().toISOString()
    };
  }
}
