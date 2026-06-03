import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import {
  CardioSportType,
  CardioStepMode,
  CardioStepType,
  ExerciseInstanceIntensity,
  ExerciseInstanceMode,
  ExerciseInstanceTempo,
  WorkoutDifficulty,
  WorkoutType,
  WorkoutVisibility,
} from 'src/database/interfaces';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import { PageResponse } from 'src/lib/http/dto/page-response.dto';
import { IsEnumString } from 'src/lib/validators/is-enum-string';

export class ExerciseInfoDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  picture?: string | null;
}

export class ExerciseInstanceDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsObject()
  @ValidateNested()
  exercise: ExerciseInfoDTO;

  @ApiProperty({ enum: ExerciseInstanceMode })
  @IsEnumString(ExerciseInstanceMode)
  mode: ExerciseInstanceMode;

  @ApiProperty()
  sets: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  reps?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  executionTime?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  load?: number | null;

  @ApiPropertyOptional({ enum: ExerciseInstanceIntensity })
  @IsEnumString(ExerciseInstanceIntensity)
  @IsOptional()
  intensity?: ExerciseInstanceIntensity | null;

  @ApiPropertyOptional({ enum: ExerciseInstanceTempo })
  @IsEnumString(ExerciseInstanceTempo)
  @IsOptional()
  tempo?: ExerciseInstanceTempo | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  notes?: string | null;
}

export class ExerciseInstanceGroupDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  repeat: number;

  @ApiProperty({ type: [ExerciseInstanceDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  items: ExerciseInstanceDTO[];
}

// Cardio DTOs
export class CardioCategoryDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: CardioSportType })
  @IsEnumString(CardioSportType)
  sportType: CardioSportType;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  userId?: string | null;
}

export class CardioStepDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: CardioStepType })
  @IsEnumString(CardioStepType)
  type: CardioStepType;

  @ApiProperty({ enum: CardioStepMode })
  @IsEnumString(CardioStepMode)
  mode: CardioStepMode;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  duration?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  distance?: number | null;

  // HR targets
  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  hrMin?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  hrMax?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  hrZone?: number | null;

  // Power targets
  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  powerMin?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  powerMax?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  powerZone?: number | null;

  // Pace targets
  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  paceMin?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  paceMax?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  paceZone?: number | null;

  // RPE targets
  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  rpeMin?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  rpeMax?: number | null;

  @ApiPropertyOptional({ type: Number })
  @IsInt()
  @IsOptional()
  rpeZone?: number | null;

  @ApiPropertyOptional({ type: String })
  @IsString()
  @IsOptional()
  notes?: string | null;
}

export class CardioStepGroupDTO {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  repeat: number;

  @ApiProperty({ type: [CardioStepDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  items: CardioStepDTO[];
}

export class WorkoutItemDTO {
  @ApiProperty({ description: 'Item type: exercise_instance, group, cardio_step, or cardio_step_group' })
  @IsString()
  type: 'exercise_instance' | 'group' | 'cardio_step' | 'cardio_step_group';

  @ApiProperty()
  position: number;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  @ValidateNested()
  exerciseInstance?: ExerciseInstanceDTO;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  @ValidateNested()
  group?: ExerciseInstanceGroupDTO;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  @ValidateNested()
  cardioStep?: CardioStepDTO;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  @ValidateNested()
  cardioStepGroup?: CardioStepGroupDTO;
}

export class WorkoutDTO {
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

  @ApiProperty({
    enum: WorkoutVisibility,
    description:
      '`personal` (creator-only, plus org admins / coaches with a relationship) or `org_library` ' +
      '(visible to every org member). Defaults to `personal`.',
  })
  @IsEnumString(WorkoutVisibility)
  visibility: WorkoutVisibility;

  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ type: String })
  @IsUUID()
  @IsOptional()
  cardioCategoryId?: string | null;

  @ApiPropertyOptional({ type: CardioCategoryDTO })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  cardioCategory?: CardioCategoryDTO | null;

  @ApiProperty({ type: [WorkoutItemDTO] })
  @IsArray()
  @ValidateNested({ each: true })
  items: WorkoutItemDTO[];

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  featuredFrom: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  featuredUntil: string | null;

  @ApiProperty()
  @IsString()
  createdAt: string;

  @ApiProperty()
  @IsString()
  updatedAt: string;
}

export class WorkoutResponse extends ItemResponse<WorkoutDTO> {
  @ApiProperty()
  @IsObject({ always: true })
  @ValidateNested()
  declare data: WorkoutDTO;
}

export class WorkoutListResponse extends PageResponse<WorkoutDTO> {
  @ApiProperty({ type: [WorkoutDTO] })
  @IsArray({ always: true })
  @ValidateNested()
  declare data: WorkoutDTO[];
}
