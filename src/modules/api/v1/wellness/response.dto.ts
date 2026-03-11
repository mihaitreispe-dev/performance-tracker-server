import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { IllnessType, WellnessCheckinSource } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class QuickWellnessCheckinDTO {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Check-in date (YYYY-MM-DD)' })
  @IsString()
  checkinDate: string;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Sleep quality (1-5)' })
  @IsNumber()
  @IsOptional()
  sleepQuality?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Energy level (1-5)' })
  @IsNumber()
  @IsOptional()
  energyLevel?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Muscle soreness (1-5, inverted)' })
  @IsNumber()
  @IsOptional()
  muscleSoreness?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Stress level (1-5, inverted)' })
  @IsNumber()
  @IsOptional()
  stressLevel?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Training readiness (1-5)' })
  @IsNumber()
  @IsOptional()
  trainingReadiness?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Time to complete in seconds' })
  @IsNumber()
  @IsOptional()
  completionSeconds?: number | null;

  @ApiProperty({ enum: WellnessCheckinSource })
  @IsEnumString(WellnessCheckinSource)
  source: WellnessCheckinSource;

  @ApiProperty({ description: 'Composite wellness score (0-100)' })
  @IsNumber()
  wellnessScore: number;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class QuickWellnessCheckinResponse extends ItemResponse<QuickWellnessCheckinDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: QuickWellnessCheckinDTO;
}

export class QuickWellnessCheckinListResponse {
  @ApiProperty({ type: [QuickWellnessCheckinDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  data: QuickWellnessCheckinDTO[];
}

export class WellnessAveragesDTO {
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  sleepQuality?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  energyLevel?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  muscleSoreness?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  stressLevel?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsNumber()
  @IsOptional()
  trainingReadiness?: number | null;

  @ApiProperty({ description: 'Number of days included in average' })
  @IsNumber()
  daysIncluded: number;
}

export class WellnessAveragesResponse extends ItemResponse<WellnessAveragesDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WellnessAveragesDTO;
}

export class WellnessTrendDTO {
  @ApiProperty({ description: 'Current wellness score (0-100)' })
  @IsNumber()
  current: number;

  @ApiProperty({ description: 'Average wellness score over period' })
  @IsNumber()
  average: number;

  @ApiProperty({ enum: ['improving', 'stable', 'declining'] })
  @IsString()
  trend: 'improving' | 'stable' | 'declining';

  @ApiProperty({ description: 'Check-in compliance percentage' })
  @IsNumber()
  compliancePercentage: number;
}

export class WellnessTrendResponse extends ItemResponse<WellnessTrendDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WellnessTrendDTO;
}

// Illness Logs

export class IllnessLogDTO {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ enum: IllnessType })
  @IsEnumString(IllnessType)
  illnessType: IllnessType;

  @ApiProperty({ description: 'Severity (1-10)' })
  @IsNumber()
  severity: number;

  @ApiProperty({ description: 'Start date (YYYY-MM-DD)' })
  @IsString()
  startDate: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'End date (YYYY-MM-DD)' })
  @IsString()
  @IsOptional()
  endDate?: string | null;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsArray()
  @IsOptional()
  symptoms?: string[] | null;

  @ApiProperty()
  @IsBoolean()
  affectsTraining: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  notes?: string | null;

  @ApiProperty({ description: 'Whether the illness is currently active' })
  @IsBoolean()
  isActive: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  coachNotifiedAt?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class IllnessLogResponse extends ItemResponse<IllnessLogDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: IllnessLogDTO;
}

export class IllnessLogListResponse {
  @ApiProperty({ type: [IllnessLogDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  data: IllnessLogDTO[];
}
