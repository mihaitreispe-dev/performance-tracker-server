import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

import {
  UserGoalPeriod,
  UserGoalStatus,
  UserGoalType,
} from 'src/database/interfaces/user-goals-table.interface';

export class CreateGoalBody {
  @ApiProperty({ enum: UserGoalType, description: 'Goal type; system types auto-advance.' })
  @IsEnum(UserGoalType)
  goalType: UserGoalType;

  @ApiPropertyOptional({ type: String, description: 'Label; required for a custom goal.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiProperty({ type: Number, description: 'Self-selected target (>= 1).' })
  @IsInt()
  @Min(1)
  targetValue: number;

  @ApiPropertyOptional({ type: String, description: 'Display unit (e.g. "sessions", "days").' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional({ enum: UserGoalPeriod, description: 'Reset cadence (default ongoing).' })
  @IsOptional()
  @IsEnum(UserGoalPeriod)
  period?: UserGoalPeriod;
}

export class UpdateGoalBody {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetValue?: number;

  /** Honored only for custom goals; ignored for system (server-advanced) goals. */
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  currentValue?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ enum: UserGoalStatus })
  @IsOptional()
  @IsEnum(UserGoalStatus)
  status?: UserGoalStatus;
}

export class GoalIdParam {
  @ApiProperty({ type: String, description: 'user_goals.id' })
  @IsUUID('4')
  id: string;
}

export class RecapQuery {
  @ApiPropertyOptional({ enum: ['week', 'month'], description: 'Aggregation window (default week).' })
  @IsOptional()
  @IsIn(['week', 'month'])
  period?: 'week' | 'month';
}

export class UpdateAvatarBody {
  @ApiProperty({
    type: Object,
    description: 'Equipped cosmetics keyed by slot (e.g. { pot: "pot_gold" }). Each must be unlocked at the user\'s level.',
  })
  @IsObject()
  equipped: Record<string, string>;
}
