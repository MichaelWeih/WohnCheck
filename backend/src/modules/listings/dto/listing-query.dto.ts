import { ListingStatus, ProviderKind } from "@prisma/client";
import { IsOptional, IsString } from "class-validator";

export class ListingQueryDto {
  @IsOptional()
  @IsString()
  bbox?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  status?: ListingStatus;

  @IsOptional()
  @IsString()
  providerKind?: ProviderKind;

  @IsOptional()
  @IsString()
  minRent?: string;

  @IsOptional()
  @IsString()
  maxRent?: string;

  @IsOptional()
  @IsString()
  minRooms?: string;

  @IsOptional()
  @IsString()
  maxRooms?: string;

  @IsOptional()
  @IsString()
  minArea?: string;

  @IsOptional()
  @IsString()
  maxArea?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  offset?: string;
}
