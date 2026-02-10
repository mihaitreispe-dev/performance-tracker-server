import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { WorkoutDifficulty, WorkoutType } from 'src/database/interfaces';
import { IsEnumString } from 'src/lib/validators/is-enum-string';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';

export class WorkoutInfoDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiProperty({ enum: WorkoutDifficulty })
  @IsEnumString(WorkoutDifficulty)
  difficulty: WorkoutDifficulty;

  @ApiProperty({ enum: WorkoutType })
  @IsEnumString(WorkoutType)
  type: WorkoutType;
}

export class WorkoutScheduleDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  workout: WorkoutInfoDTO;

  @ApiProperty({ type: String, format: 'date' })
  @IsString()
  scheduledDate: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  completedAt?: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class WorkoutScheduleResponse extends ItemResponse<WorkoutScheduleDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutScheduleDTO;
}

export class WorkoutScheduleListResponse extends PageResponse<WorkoutScheduleDTO> {
  @ApiProperty({ type: [WorkoutScheduleDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: WorkoutScheduleDTO[];
}
