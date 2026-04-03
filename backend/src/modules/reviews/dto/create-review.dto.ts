import { TargetType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateReviewDto {
  @IsEnum(TargetType)
  targetType!: TargetType;

  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @IsString()
  @MaxLength(100)
  title!: string;

  @IsString()
  @MaxLength(2000)
  text!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  overallRating!: number;

  @IsObject()
  categoryRatings!: Record<string, number>;

  @IsOptional()
  @IsString()
  verificationLevel?: string;
}
