import { ApiProperty } from '@nestjs/swagger';

import { ItemResponse } from 'src/lib/http/dto/item-response.dto';
import type { AvatarState } from 'src/database/interfaces/user-progression-table.interface';
import type {
  UserGoalPeriod,
  UserGoalStatus,
  UserGoalType,
} from 'src/database/interfaces/user-goals-table.interface';
import type { QuestObjectiveType, QuestPeriod } from 'src/database/interfaces/quests-table.interface';
import type { QuestAssignmentStatus } from 'src/database/interfaces/quest-assignments-table.interface';

export class GoalDTO {
  @ApiProperty({ type: String }) id: string;
  @ApiProperty({ type: String }) goalType: UserGoalType;
  @ApiProperty({ type: String, nullable: true }) title: string | null;
  @ApiProperty({ type: Number }) targetValue: number;
  @ApiProperty({ type: Number }) currentValue: number;
  @ApiProperty({ type: String, nullable: true }) unit: string | null;
  @ApiProperty({ type: String }) period: UserGoalPeriod;
  @ApiProperty({ type: String }) status: UserGoalStatus;
  @ApiProperty({ type: String, nullable: true }) completedAt: string | null;
  @ApiProperty({ type: String }) createdAt: string;
}

export class StreakDTO {
  @ApiProperty({ type: Number }) current: number;
  @ApiProperty({ type: Number }) longest: number;
  @ApiProperty({ type: String, nullable: true }) lastActiveDate: string | null;
  @ApiProperty({ type: Number }) graceRemaining: number;
  /** Earned freeze tokens that auto-protect the streak after grace. */
  @ApiProperty({ type: Number }) freezes: number;
}

export class HabitMilestoneDTO {
  @ApiProperty({ type: Number }) level: number;
  @ApiProperty({ type: Boolean }) reached: boolean;
}

export class JourneyMilestonesDTO {
  @ApiProperty({ type: HabitMilestoneDTO }) habitEstablished: HabitMilestoneDTO;
}

export class QuestSummaryDTO {
  @ApiProperty({ type: String }) id: string;
  @ApiProperty({ type: String }) title: string;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty({ type: String }) objectiveType: QuestObjectiveType;
  @ApiProperty({ type: Number }) targetValue: number;
  @ApiProperty({ type: Number }) progressValue: number;
  @ApiProperty({ type: Number }) rewardXp: number;
  @ApiProperty({ type: String }) period: QuestPeriod;
  @ApiProperty({ type: String }) status: QuestAssignmentStatus;
  @ApiProperty({ type: String, nullable: true }) windowEnd: string | null;
}

export class SeasonRewardDTO {
  @ApiProperty({ type: String }) cosmeticId: string;
  @ApiProperty({ type: Number }) pointsThreshold: number;
  @ApiProperty({ type: Boolean }) earned: boolean;
}

export class SeasonDTO {
  @ApiProperty({ type: String }) id: string;
  @ApiProperty({ type: String }) slug: string;
  @ApiProperty({ type: String }) name: string;
  @ApiProperty({ type: String }) theme: string;
  @ApiProperty({ type: String }) startsOn: string;
  @ApiProperty({ type: String }) endsOn: string;
  @ApiProperty({ type: Number }) daysRemaining: number;
  /** The viewer's derived season points (XP earned in the season window). */
  @ApiProperty({ type: Number }) points: number;
  @ApiProperty({ type: [SeasonRewardDTO] }) rewards: SeasonRewardDTO[];
}

export class LeaderboardEntryDTO {
  @ApiProperty({ type: String }) userId: string;
  @ApiProperty({ type: String, description: 'Privacy-safe name, e.g. "Jane D."' }) name: string;
  @ApiProperty({ type: Number }) points: number;
  @ApiProperty({ type: Number }) activeDays: number;
  @ApiProperty({ type: Boolean }) isMe: boolean;
  @ApiProperty({ type: Number }) rank: number;
}

export class LeaderboardDTO {
  /** False when the viewer hasn't opted in — the UI shows the opt-in prompt. */
  @ApiProperty({ type: Boolean }) optedIn: boolean;
  @ApiProperty({ type: [LeaderboardEntryDTO] }) entries: LeaderboardEntryDTO[];
}

export class JourneySummaryDTO {
  @ApiProperty({ type: Number }) xp: number;
  @ApiProperty({ type: Number }) level: number;
  @ApiProperty({ type: Number }) xpIntoLevel: number;
  @ApiProperty({ type: Number }) xpForNextLevel: number;
  @ApiProperty({ type: StreakDTO }) streak: StreakDTO;
  @ApiProperty({ type: Object, description: 'Equipped avatar cosmetics blob.' })
  avatarState: AvatarState;
  /** Earned (non-level) cosmetic ids — seasonal/leaderboard rewards. */
  @ApiProperty({ type: [String] }) unlockedCosmetics: string[];
  @ApiProperty({ type: [GoalDTO] }) goals: GoalDTO[];
  @ApiProperty({ type: [QuestSummaryDTO] }) quests: QuestSummaryDTO[];
  @ApiProperty({ type: SeasonDTO, nullable: true }) season: SeasonDTO | null;
  @ApiProperty({ type: Boolean }) leaderboardOptIn: boolean;
  @ApiProperty({ type: JourneyMilestonesDTO }) milestones: JourneyMilestonesDTO;
}

/** Journey envelope (`{ data: {...} }`). */
export class JourneySummaryResponse extends ItemResponse<JourneySummaryDTO> {
  @ApiProperty({ type: JourneySummaryDTO })
  declare data: JourneySummaryDTO;
}

/** Single-goal envelope. */
export class GoalResponse extends ItemResponse<GoalDTO> {
  @ApiProperty({ type: GoalDTO })
  declare data: GoalDTO;
}

/** Goal collection envelope (not paginated — a user's goal list is small). */
export class GoalListResponse extends ItemResponse<GoalDTO[]> {
  @ApiProperty({ type: [GoalDTO] })
  declare data: GoalDTO[];
}

/** Active-quest collection envelope for the athlete. */
export class QuestListResponse extends ItemResponse<QuestSummaryDTO[]> {
  @ApiProperty({ type: [QuestSummaryDTO] })
  declare data: QuestSummaryDTO[];
}

export class RecapDTO {
  @ApiProperty({ type: String }) period: string;
  @ApiProperty({ type: Number }) totalXp: number;
  @ApiProperty({ type: Number }) workouts: number;
  @ApiProperty({ type: Number }) snacks: number;
  @ApiProperty({ type: Number }) activeDays: number;
  @ApiProperty({ type: Number }) goalsCompleted: number;
  @ApiProperty({ type: Number }) questsCompleted: number;
}

export class RecapResponse extends ItemResponse<RecapDTO> {
  @ApiProperty({ type: RecapDTO })
  declare data: RecapDTO;
}

/** Active-season envelope (`data` is null when no season is in window). */
export class SeasonResponse extends ItemResponse<SeasonDTO | null> {
  @ApiProperty({ type: SeasonDTO, nullable: true })
  declare data: SeasonDTO | null;
}

/** Cohort leaderboard envelope. */
export class LeaderboardResponse extends ItemResponse<LeaderboardDTO> {
  @ApiProperty({ type: LeaderboardDTO })
  declare data: LeaderboardDTO;
}
