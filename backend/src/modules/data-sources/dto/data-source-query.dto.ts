import { IsBooleanString, IsNumberString, IsOptional, IsString, MaxLength } from "class-validator";

export class DataSourceQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsBooleanString()
  refresh?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @IsNumberString()
  lat?: string;

  @IsOptional()
  @IsNumberString()
  lon?: string;

  @IsOptional()
  @IsNumberString()
  radius?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  houseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  postalCode?: string;
}
