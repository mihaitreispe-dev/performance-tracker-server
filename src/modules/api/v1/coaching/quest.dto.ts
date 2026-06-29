import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

import {
  QuestObjectiveType,
  QuestPeriod,
  QuestStatus,
} from 'src/database/interfaces/quests-table.interface';
import type { QuestAssignmentStatus } from 'src/database/interfaces/quest-assignments-table.interface';
import { ItemResponse } from 'src/lib/http/dto/item-response.dto';

// ---- requests -------------------------------------------------------------

export class CreateQuestBody {
  @ApiProperty({ type: String }) @IsString() @MaxLength(120) title: string;

  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(500) description?: string;

  @ApiProperty({ enum: QuestObjectiveType }) @IsEnum(QuestObjectiveType) objectiveType: QuestObjectiveType;

  @ApiProperty({ type: Number, description: 'Target to reach (>= 1).' }) @IsInt() @Min(1) targetValue: number;

  @ApiPropertyOptional({ enum: QuestPeriod, description: 'one_off (default) | weekly.' })
  @IsOptional()
  @IsEnum(QuestPeriod)
  period?: QuestPeriod;

  @ApiPropertyOptional({ type: Number, description: 'Reward XP on completion.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rewardXp?: number;

  @ApiPropertyOptional({ type: String, description: 'one_off due date (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateQuestBody {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(120) title?: string;
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(1) targetValue?: number;
  @ApiPropertyOptional({ type: Number }) @IsOptional() @IsInt() @Min(0) rewardXp?: number;
  @ApiPropertyOptional({ enum: QuestStatus }) @IsOptional() @IsEnum(QuestStatus) status?: QuestStatus;
}

export class AssignQuestBody {
  @ApiProperty({ type: String, description: 'quests.id to assign.' }) @IsUUID('4') questId: string;
}

export class QuestIdParam {
  @ApiProperty({ type: String, description: 'quests.id' }) @IsUUID('4') questId: string;
}

// ---- responses ------------------------------------------------------------

export class CoachQuestDTO {
  @ApiProperty({ type: String }) id: string;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: String }) objectiveType: QuestObjectiveType;
  @ApiProperty({ type: Number }) targetValue: number;
  @ApiProperty({ type: String }) period: QuestPeriod;
  @ApiProperty({ type: Number }) rewardXp: number;
  @ApiProperty({ type: String, nullable: true }) dueDate: string | null;
  @ApiProperty({ type: String }) status: QuestStatus;
  @ApiProperty({ type: String }) createdAt: string;
}

export class QuestAssignmentDTO {
  @ApiProperty({ type: String }) id: string;
  @ApiProperty({ type: String }) questId: string;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String }) objectiveType: QuestObjectiveType;
  @ApiProperty({ type: Number }) targetValue: number;
  @ApiProperty({ type: Number }) progressValue: number;
  @ApiProperty({ type: Number }) rewardXp: number;
  @ApiProperty({ type: String }) period: QuestPeriod;
  @ApiProperty({ type: String }) status: QuestAssignmentStatus;
  @ApiProperty({ type: String, nullable: true }) windowEnd: string | null;
}

export class AssignQuestResultDTO {
  @ApiProperty({ type: Number }) assignmentsCreated: number;
}

export class CoachQuestResponse extends ItemResponse<CoachQuestDTO> {
  @ApiProperty({ type: CoachQuestDTO }) declare data: CoachQuestDTO;
}
export class CoachQuestListResponse extends ItemResponse<CoachQuestDTO[]> {
  @ApiProperty({ type: [CoachQuestDTO] }) declare data: CoachQuestDTO[];
}
export class QuestAssignmentListResponse extends ItemResponse<QuestAssignmentDTO[]> {
  @ApiProperty({ type: [QuestAssignmentDTO] }) declare data: QuestAssignmentDTO[];
}
export class AssignQuestResultResponse extends ItemResponse<AssignQuestResultDTO> {
  @ApiProperty({ type: AssignQuestResultDTO }) declare data: AssignQuestResultDTO;
}
