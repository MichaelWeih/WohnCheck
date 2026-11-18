import { TargetType } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateReviewDto {
  @IsEnum(TargetType)
  targetType!: TargetType;

  @IsString()
  @IsNotEmpty()
  targetId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  title!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  text!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  overallRating!: number;

  @IsObject()
  categoryRatings!: Record<string, number>;
}
