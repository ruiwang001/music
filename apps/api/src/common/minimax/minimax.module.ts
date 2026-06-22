import { Global, Module } from "@nestjs/common";
import { MiniMaxService } from "./minimax.service";

@Global()
@Module({
  providers: [MiniMaxService],
  exports: [MiniMaxService]
})
export class MiniMaxModule {}
