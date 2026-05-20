import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Free-form per-question answer payload. Keyed by question id; the value depends
 * on the type (string for single_choice/text, string[] for multi_choice, number
 * for scale). Validated against the questionnaire's schema_json on write so the
 * generator can trust the shape downstream.
 */
export type QuestionnaireAnswers = Record<string, string | string[] | number>;

export interface OnboardingResponsesTable {
  id: Generated<string>;
  questionnaire_id: string;
  organisation_id: string;
  user_id: string;
  answers_json: ColumnType<QuestionnaireAnswers, QuestionnaireAnswers, QuestionnaireAnswers>;
  /**
   * Flat string[] of profile tags derived from `answers_json` by walking the
   * questionnaire's schema once at write time. Lets downstream consumers (generator,
   * future ML) read tags without re-applying schema rules.
   */
  derived_tags: ColumnType<string[], string[] | undefined, string[]>;
  completed_at: Generated<Timestamp>;
  created_at: Generated<Timestamp>;
}

export type OnboardingResponse = Selectable<OnboardingResponsesTable>;
export type NewOnboardingResponse = Insertable<OnboardingResponsesTable>;
export type OnboardingResponseUpdate = Updateable<OnboardingResponsesTable>;
