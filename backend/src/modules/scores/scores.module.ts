import { Module } from "@nestjs/common";
import { ReviewsModule } from "../reviews/reviews.module";
import { ScoresController } from "./scores.controller";
import { ScoresService } from "./scores.service";

@Module({
  imports: [ReviewsModule],
  controllers: [ScoresController],
  providers: [ScoresService],
  exports: [ScoresService],
})
export class ScoresModule {}
