import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { WorkoutPlanGoal } from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class WorkoutInfoForPlanDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  difficulty: string;

  @ApiProperty()
  @IsInt()
  exerciseCount: number;
}

export class WorkoutPlanItemDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsInt()
  weekNumber: number;

  @ApiProperty()
  @IsInt()
  dayOfWeek: number;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  workout: WorkoutInfoForPlanDTO;

  @ApiProperty()
  @IsString()
  createdAt: string;
}

export class WorkoutPlanDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsString()
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional({ enum: WorkoutPlanGoal, nullable: true })
  @IsEnumString(WorkoutPlanGoal)
  @IsOptional()
  goal?: WorkoutPlanGoal | null;

  @ApiProperty()
  @IsInt()
  durationWeeks: number;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class WorkoutPlanWithItemsDTO extends WorkoutPlanDTO {
  @ApiProperty({ type: [WorkoutPlanItemDTO] })
  @IsArray()
  @ValidateNested()
  items: WorkoutPlanItemDTO[];
}

export class WorkoutPlanResponse extends ItemResponse<WorkoutPlanDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutPlanDTO;
}

export class WorkoutPlanWithItemsResponse extends ItemResponse<WorkoutPlanWithItemsDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutPlanWithItemsDTO;
}

export class WorkoutPlanListResponse extends PageResponse<WorkoutPlanDTO> {
  @ApiProperty({ type: [WorkoutPlanDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: WorkoutPlanDTO[];
}

export class WorkoutPlanItemResponse extends ItemResponse<WorkoutPlanItemDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutPlanItemDTO;
}

export class ActivatePlanResultDTO {
  @ApiProperty({ description: 'Number of schedules created' })
  @IsInt()
  schedulesCreated: number;
}

export class ActivatePlanResponse extends ItemResponse<ActivatePlanResultDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: ActivatePlanResultDTO;
}
