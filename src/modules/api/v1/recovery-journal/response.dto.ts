import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecoveryJournalEntryDTO {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  entryDate!: string;

  @ApiPropertyOptional()
  sleepQualityRating!: number | null;

  @ApiPropertyOptional()
  sleepLatencyMinutes!: number | null;

  @ApiPropertyOptional()
  sleepDisturbances!: number | null;

  @ApiPropertyOptional()
  perceivedRecovery!: number | null;

  @ApiPropertyOptional()
  muscleSoreness!: number | null;

  @ApiPropertyOptional()
  energyLevel!: number | null;

  @ApiPropertyOptional()
  mood!: number | null;

  @ApiPropertyOptional()
  stressLevel!: number | null;

  @ApiPropertyOptional()
  motivationLevel!: number | null;

  @ApiPropertyOptional()
  caffeineMg!: number | null;

  @ApiPropertyOptional()
  caffeineCutoffTime!: string | null;

  @ApiPropertyOptional()
  alcoholUnits!: number | null;

  @ApiPropertyOptional()
  hydrationLiters!: number | null;

  @ApiPropertyOptional()
  mealQuality!: number | null;

  @ApiPropertyOptional()
  injuryConcerns!: string | null;

  @ApiPropertyOptional()
  notes!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class RecoveryJournalEntryResponse {
  @ApiProperty({ type: RecoveryJournalEntryDTO })
  data!: RecoveryJournalEntryDTO;
}

export class RecoveryJournalEntryListResponse {
  @ApiProperty({ type: [RecoveryJournalEntryDTO] })
  data!: RecoveryJournalEntryDTO[];
}

export class RecoveryAveragesDTO {
  @ApiPropertyOptional()
  avgPerceivedRecovery!: number | null;

  @ApiPropertyOptional()
  avgMuscleSoreness!: number | null;

  @ApiPropertyOptional()
  avgEnergyLevel!: number | null;

  @ApiPropertyOptional()
  avgMood!: number | null;

  @ApiPropertyOptional()
  avgStressLevel!: number | null;

  @ApiPropertyOptional()
  avgMotivationLevel!: number | null;
}

export class RecoveryHistoryResponse {
  @ApiProperty({ type: [RecoveryJournalEntryDTO] })
  data!: RecoveryJournalEntryDTO[];

  @ApiProperty({ type: RecoveryAveragesDTO })
  averages!: RecoveryAveragesDTO;
}

export class CorrelationDTO {
  @ApiProperty({ description: 'Factor being correlated' })
  factor!: string;

  @ApiProperty({ description: 'Correlation coefficient (-1 to 1)' })
  correlation!: number;

  @ApiProperty({ description: 'Interpretation of the correlation' })
  interpretation!: string;

  @ApiProperty({ description: 'Statistical significance' })
  significant!: boolean;
}

export class RecoveryCorrelationsResponse {
  @ApiProperty({ type: [CorrelationDTO] })
  data!: CorrelationDTO[];

  @ApiProperty({ description: 'Number of data points used' })
  dataPoints!: number;

  @ApiProperty({ description: 'Analysis period in days' })
  periodDays!: number;
}
