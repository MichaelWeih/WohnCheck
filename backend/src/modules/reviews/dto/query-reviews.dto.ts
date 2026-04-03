import { TargetType } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class QueryReviewsDto {
  @IsOptional()
  @IsEnum(TargetType)
  targetType?: TargetType;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
