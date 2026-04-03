import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ModerateReviewDto {
  @IsIn(["publish", "reject"])
  action!: "publish" | "reject";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
