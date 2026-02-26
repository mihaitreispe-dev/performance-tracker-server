import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { BodyPart, BodyView, PainTrend } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';

export class PainLogDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsUUID()
  workoutExecutionId: string;

  @ApiProperty({ enum: BodyPart })
  @IsEnum(BodyPart)
  bodyPart: BodyPart;

  @ApiProperty({ enum: BodyView })
  @IsEnum(BodyView)
  bodyView: BodyView;

  @ApiProperty({ description: 'Pain level (1-10)' })
  @IsNumber()
  painLevel: number;

  @ApiProperty({ description: 'When pain started (% of workout, 0-100)' })
  @IsNumber()
  painDurationStart: number;

  @ApiProperty({ description: 'When pain ended (% of workout, 0-100)' })
  @IsNumber()
  painDurationEnd: number;

  @ApiProperty({ enum: PainTrend })
  @IsEnum(PainTrend)
  painTrend: PainTrend;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  notes?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class PainLogResponse extends ItemResponse<PainLogDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: PainLogDTO;
}

export class PainLogListResponse extends PageResponse<PainLogDTO> {
  @ApiProperty({ type: [PainLogDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: PainLogDTO[];
}
