import { Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { RecoveryJournalEntry } from 'src/database/interfaces';
import { formatDateToYMD } from 'src/lib/util';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { HrvBaselineRepository } from 'src/repositories/hrv-baseline.repository';
import { RecoveryJournalRepository } from 'src/repositories/recovery-journal.repository';

import {
  CreateRecoveryJournalEntryBody,
  RecoveryJournalCorrelationQuery,
  RecoveryJournalHistoryQuery,
  UpdateRecoveryJournalEntryBody,
} from './request.dto';
import {
  CorrelationDTO,
  RecoveryAveragesDTO,
  RecoveryCorrelationsResponse,
  RecoveryHistoryResponse,
  RecoveryJournalEntryDTO,
  RecoveryJournalEntryListResponse,
  RecoveryJournalEntryResponse,
} from './response.dto';

@Injectable()
export class RecoveryJournalService {
  constructor(
    private readonly recoveryJournalRepository: RecoveryJournalRepository,
    private readonly hrvBaselineRepository: HrvBaselineRepository,
  ) {}

  async getToday(req: Request & { user: AuthUser }): Promise<RecoveryJournalEntryResponse> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entry = await this.recoveryJournalRepository.findByUserAndDate(req.user.id, today);

    if (!entry) {
      throw new NotFoundException('No journal entry found for today');
    }

    return {
      data: this.mapToDTO(entry),
    };
  }

  async getByDate(req: Request & { user: AuthUser }, date: string): Promise<RecoveryJournalEntryResponse> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const entry = await this.recoveryJournalRepository.findByUserAndDate(req.user.id, targetDate);

    if (!entry) {
      throw new NotFoundException(`No journal entry found for ${date}`);
    }

    return {
      data: this.mapToDTO(entry),
    };
  }

  async create(
    req: Request & { user: AuthUser },
    body: CreateRecoveryJournalEntryBody,
  ): Promise<RecoveryJournalEntryResponse> {
    const entryDate = new Date(body.entryDate);
    entryDate.setHours(0, 0, 0, 0);

    const entry = await this.recoveryJournalRepository.upsert({
      user_id: req.user.id,
      entry_date: formatDateToYMD(entryDate),
      sleep_quality_rating: body.sleepQualityRating ?? null,
      sleep_latency_minutes: body.sleepLatencyMinutes ?? null,
      sleep_disturbances: body.sleepDisturbances ?? null,
      perceived_recovery: body.perceivedRecovery ?? null,
      muscle_soreness: body.muscleSoreness ?? null,
      energy_level: body.energyLevel ?? null,
      mood: body.mood ?? null,
      stress_level: body.stressLevel ?? null,
      motivation_level: body.motivationLevel ?? null,
      caffeine_mg: body.caffeineMg ?? null,
      caffeine_cutoff_time: body.caffeineCutoffTime ?? null,
      alcohol_units: body.alcoholUnits ?? null,
      hydration_liters: body.hydrationLiters ?? null,
      meal_quality: body.mealQuality ?? null,
      injury_concerns: body.injuryConcerns ?? null,
      notes: body.notes ?? null,
    });

    return {
      data: this.mapToDTO(entry),
    };
  }

  async update(
    req: Request & { user: AuthUser },
    id: string,
    body: UpdateRecoveryJournalEntryBody,
  ): Promise<RecoveryJournalEntryResponse> {
    const existing = await this.recoveryJournalRepository.findById(id);

    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException('Journal entry not found');
    }

    const updateData: Record<string, unknown> = {};

    if (body.sleepQualityRating !== undefined) updateData.sleep_quality_rating = body.sleepQualityRating;
    if (body.sleepLatencyMinutes !== undefined) updateData.sleep_latency_minutes = body.sleepLatencyMinutes;
    if (body.sleepDisturbances !== undefined) updateData.sleep_disturbances = body.sleepDisturbances;
    if (body.perceivedRecovery !== undefined) updateData.perceived_recovery = body.perceivedRecovery;
    if (body.muscleSoreness !== undefined) updateData.muscle_soreness = body.muscleSoreness;
    if (body.energyLevel !== undefined) updateData.energy_level = body.energyLevel;
    if (body.mood !== undefined) updateData.mood = body.mood;
    if (body.stressLevel !== undefined) updateData.stress_level = body.stressLevel;
    if (body.motivationLevel !== undefined) updateData.motivation_level = body.motivationLevel;
    if (body.caffeineMg !== undefined) updateData.caffeine_mg = body.caffeineMg;
    if (body.caffeineCutoffTime !== undefined) updateData.caffeine_cutoff_time = body.caffeineCutoffTime;
    if (body.alcoholUnits !== undefined) updateData.alcohol_units = body.alcoholUnits;
    if (body.hydrationLiters !== undefined) updateData.hydration_liters = body.hydrationLiters;
    if (body.mealQuality !== undefined) updateData.meal_quality = body.mealQuality;
    if (body.injuryConcerns !== undefined) updateData.injury_concerns = body.injuryConcerns;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const updated = await this.recoveryJournalRepository.update(id, updateData);

    if (!updated) {
      throw new NotFoundException('Journal entry not found');
    }

    return {
      data: this.mapToDTO(updated),
    };
  }

  async delete(req: Request & { user: AuthUser }, id: string): Promise<void> {
    const existing = await this.recoveryJournalRepository.findById(id);

    if (!existing || existing.user_id !== req.user.id) {
      throw new NotFoundException('Journal entry not found');
    }

    await this.recoveryJournalRepository.delete(id);
  }

  async getHistory(
    req: Request & { user: AuthUser },
    query: RecoveryJournalHistoryQuery,
  ): Promise<RecoveryHistoryResponse> {
    const days = query.days ?? 30;

    const entries = await this.recoveryJournalRepository.getHistory(req.user.id, days);
    const averages = await this.recoveryJournalRepository.getAverageMetrics(req.user.id, days);

    return {
      data: entries.map((e) => this.mapToDTO(e)),
      averages: {
        avgPerceivedRecovery: averages.avgPerceivedRecovery,
        avgMuscleSoreness: averages.avgMuscleSoreness,
        avgEnergyLevel: averages.avgEnergyLevel,
        avgMood: averages.avgMood,
        avgStressLevel: averages.avgStressLevel,
        avgMotivationLevel: averages.avgMotivationLevel,
      },
    };
  }

  async getCorrelations(
    req: Request & { user: AuthUser },
    query: RecoveryJournalCorrelationQuery,
  ): Promise<RecoveryCorrelationsResponse> {
    const days = query.days ?? 30;

    // Get journal entries and HRV baselines
    const entries = await this.recoveryJournalRepository.getHistory(req.user.id, days);
    const hrvBaselines = await this.hrvBaselineRepository.getDateRange(req.user.id, days);

    if (entries.length < 7 || hrvBaselines.length < 7) {
      return {
        data: [],
        dataPoints: Math.min(entries.length, hrvBaselines.length),
        periodDays: days,
      };
    }

    // Create a map of HRV z-scores by date
    const hrvByDate = new Map<string, number>();
    for (const hrv of hrvBaselines) {
      if (hrv.hrv_zscore) {
        const dateStr = formatDateToYMD(hrv.date);
        hrvByDate.set(dateStr, parseFloat(hrv.hrv_zscore));
      }
    }

    // Calculate correlations for each factor
    const correlations: CorrelationDTO[] = [];

    // Sleep quality vs HRV
    const sleepQualityCorr = this.calculateCorrelation(entries, hrvByDate, 'sleep_quality_rating');
    if (sleepQualityCorr !== null) {
      correlations.push({
        factor: 'Sleep Quality',
        correlation: sleepQualityCorr,
        interpretation: this.interpretCorrelation(sleepQualityCorr),
        significant: Math.abs(sleepQualityCorr) > 0.3,
      });
    }

    // Alcohol vs HRV (expected negative)
    const alcoholCorr = this.calculateCorrelation(entries, hrvByDate, 'alcohol_units');
    if (alcoholCorr !== null) {
      correlations.push({
        factor: 'Alcohol',
        correlation: alcoholCorr,
        interpretation: this.interpretCorrelation(alcoholCorr, true),
        significant: Math.abs(alcoholCorr) > 0.3,
      });
    }

    // Stress vs HRV (expected negative)
    const stressCorr = this.calculateCorrelation(entries, hrvByDate, 'stress_level');
    if (stressCorr !== null) {
      correlations.push({
        factor: 'Stress',
        correlation: stressCorr,
        interpretation: this.interpretCorrelation(stressCorr, true),
        significant: Math.abs(stressCorr) > 0.3,
      });
    }

    // Perceived recovery vs HRV
    const recoveryCorr = this.calculateCorrelation(entries, hrvByDate, 'perceived_recovery');
    if (recoveryCorr !== null) {
      correlations.push({
        factor: 'Perceived Recovery',
        correlation: recoveryCorr,
        interpretation: this.interpretCorrelation(recoveryCorr),
        significant: Math.abs(recoveryCorr) > 0.3,
      });
    }

    // Muscle soreness vs HRV (expected negative)
    const sorenessCorr = this.calculateCorrelation(entries, hrvByDate, 'muscle_soreness');
    if (sorenessCorr !== null) {
      correlations.push({
        factor: 'Muscle Soreness',
        correlation: sorenessCorr,
        interpretation: this.interpretCorrelation(sorenessCorr, true),
        significant: Math.abs(sorenessCorr) > 0.3,
      });
    }

    // Energy level vs HRV
    const energyCorr = this.calculateCorrelation(entries, hrvByDate, 'energy_level');
    if (energyCorr !== null) {
      correlations.push({
        factor: 'Energy Level',
        correlation: energyCorr,
        interpretation: this.interpretCorrelation(energyCorr),
        significant: Math.abs(energyCorr) > 0.3,
      });
    }

    // Sort by absolute correlation strength
    correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

    return {
      data: correlations,
      dataPoints: Math.min(entries.length, hrvBaselines.length),
      periodDays: days,
    };
  }

  private calculateCorrelation(
    entries: RecoveryJournalEntry[],
    hrvByDate: Map<string, number>,
    field: keyof RecoveryJournalEntry,
  ): number | null {
    const pairs: { x: number; y: number }[] = [];

    for (const entry of entries) {
      const dateStr = formatDateToYMD(entry.entry_date);
      const hrvZscore = hrvByDate.get(dateStr);
      const value = entry[field];

      if (hrvZscore !== undefined && value !== null && value !== undefined) {
        const numValue = typeof value === 'string' ? parseFloat(value) : (value as number);
        if (!isNaN(numValue)) {
          pairs.push({ x: numValue, y: hrvZscore });
        }
      }
    }

    if (pairs.length < 5) return null;

    // Calculate Pearson correlation coefficient
    const n = pairs.length;
    const sumX = pairs.reduce((sum, p) => sum + p.x, 0);
    const sumY = pairs.reduce((sum, p) => sum + p.y, 0);
    const sumXY = pairs.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = pairs.reduce((sum, p) => sum + p.x * p.x, 0);
    const sumY2 = pairs.reduce((sum, p) => sum + p.y * p.y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return null;

    const correlation = numerator / denominator;
    return Math.round(correlation * 100) / 100;
  }

  private interpretCorrelation(correlation: number, invertedExpected: boolean = false): string {
    const absCorr = Math.abs(correlation);
    let strength: string;

    if (absCorr >= 0.7) strength = 'strong';
    else if (absCorr >= 0.4) strength = 'moderate';
    else if (absCorr >= 0.2) strength = 'weak';
    else return 'No significant relationship detected';

    const direction = correlation > 0 ? 'positive' : 'negative';
    const expected = invertedExpected ? 'negative' : 'positive';
    const isExpected = direction === expected;

    return `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} correlation${isExpected ? ' (as expected)' : ''}`;
  }

  private mapToDTO(entry: RecoveryJournalEntry): RecoveryJournalEntryDTO {
    return {
      id: entry.id,
      userId: entry.user_id,
      entryDate: formatDateToYMD(entry.entry_date),
      sleepQualityRating: entry.sleep_quality_rating,
      sleepLatencyMinutes: entry.sleep_latency_minutes,
      sleepDisturbances: entry.sleep_disturbances,
      perceivedRecovery: entry.perceived_recovery,
      muscleSoreness: entry.muscle_soreness,
      energyLevel: entry.energy_level,
      mood: entry.mood,
      stressLevel: entry.stress_level,
      motivationLevel: entry.motivation_level,
      caffeineMg: entry.caffeine_mg,
      caffeineCutoffTime: entry.caffeine_cutoff_time,
      alcoholUnits: entry.alcohol_units ? parseFloat(entry.alcohol_units) : null,
      hydrationLiters: entry.hydration_liters ? parseFloat(entry.hydration_liters) : null,
      mealQuality: entry.meal_quality,
      injuryConcerns: entry.injury_concerns,
      notes: entry.notes,
      createdAt: entry.created_at instanceof Date ? entry.created_at.toISOString() : String(entry.created_at),
      updatedAt: entry.updated_at instanceof Date ? entry.updated_at.toISOString() : String(entry.updated_at),
    };
  }
}
