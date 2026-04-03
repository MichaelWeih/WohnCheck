import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ScoresModule } from "../scores/scores.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [AuthModule, ScoresModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
