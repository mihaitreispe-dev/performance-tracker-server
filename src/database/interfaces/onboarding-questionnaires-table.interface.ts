import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

/**
 * Authored shape of a question on an onboarding questionnaire. Stored as JSON on the
 * questionnaire row so we can iterate the form without a migration per question type.
 * Validated server-side by `validateOnboardingSchema` before write.
 *
 * The `Onboarding*` prefix is deliberate — it disambiguates from the coach-side
 * `QuestionnaireQuestion` (a per-athlete check-in survey), which is a different
 * surface with a different schema and a different storage layout.
 */
export type OnboardingQuestionType = 'single_choice' | 'multi_choice' | 'scale' | 'text';

export interface OnboardingOption {
  /** Stable id used in the answer payload. */
  value: string;
  label?: string;
  /** Profile tags to emit when this option is selected. */
  tags?: string[];
}

export interface OnboardingQuestion {
  id: string;
  type: OnboardingQuestionType;
  prompt: string;
  helper?: string;
  /** Required for choice types. */
  options?: OnboardingOption[];
  /** Required for scale type — inclusive bounds. */
  min?: number;
  max?: number;
  /** Scale-only. "{value}" is substituted with the selected number. */
  tagTemplate?: string;
  /** If true, the form blocks submission unless this question has an answer. */
  required?: boolean;
}

export interface OnboardingSchema {
  questions: OnboardingQuestion[];
}

export interface OnboardingQuestionnairesTable {
  id: Generated<string>;
  organisation_id: string;
  name: string;
  description: string | null;
  version: Generated<number>;
  schema_json: ColumnType<OnboardingSchema, OnboardingSchema | undefined, OnboardingSchema>;
  is_published: Generated<boolean>;
  created_by_user_id: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type OnboardingQuestionnaire = Selectable<OnboardingQuestionnairesTable>;
export type NewOnboardingQuestionnaire = Insertable<OnboardingQuestionnairesTable>;
export type OnboardingQuestionnaireUpdate = Updateable<OnboardingQuestionnairesTable>;
