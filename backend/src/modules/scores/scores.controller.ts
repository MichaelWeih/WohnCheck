import { Controller, Get, Param, Post } from "@nestjs/common";
import { ScoresService } from "./scores.service";

@Controller("scores")
export class ScoresController {
  constructor(private readonly scoresService: ScoresService) {}

  @Get(":targetType/:targetId")
  getLatestScore(
    @Param("targetType") targetType: string,
    @Param("targetId") targetId: string,
  ) {
    return this.scoresService.getLatestScore(targetType, targetId);
  }

  @Post(":targetType/:targetId/recalculate")
  recalculate(
    @Param("targetType") targetType: string,
    @Param("targetId") targetId: string,
  ) {
    return this.scoresService.recalculate(targetType, targetId);
  }
}
