import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { QuestionSnapshot } from './questionnaire-instances-table.interface';
import type { Timestamp } from './timestamp';

// Response value types for each question type
export interface SingleChoiceResponse {
  type: 'single_choice';
  value: string;
}

export interface MultiChoiceResponse {
  type: 'multi_choice';
  values: string[];
}

export interface RatingScaleResponse {
  type: 'rating_scale';
  value: number;
}

export interface SliderResponse {
  type: 'slider';
  value: number;
}

export interface ShortTextResponse {
  type: 'short_text';
  value: string;
}

export interface LongTextResponse {
  type: 'long_text';
  value: string;
}

export interface YesNoResponse {
  type: 'yes_no';
  value: boolean;
}

export interface DateResponse {
  type: 'date';
  value: string; // ISO date string
}

export interface NumberResponse {
  type: 'number';
  value: number;
}

export interface BodyPartResponse {
  type: 'body_part';
  parts: { part: string; severity?: number; notes?: string }[];
}

export interface RpeResponse {
  type: 'rpe';
  value: number;
}

export interface MoodResponse {
  type: 'mood';
  value: string;
}

export type ResponseValue =
  | SingleChoiceResponse
  | MultiChoiceResponse
  | RatingScaleResponse
  | SliderResponse
  | ShortTextResponse
  | LongTextResponse
  | YesNoResponse
  | DateResponse
  | NumberResponse
  | BodyPartResponse
  | RpeResponse
  | MoodResponse
  | null;

export interface QuestionnaireResponsesTable {
  id: Generated<string>;
  instance_id: string;
  question_id: string;
  question_snapshot: QuestionSnapshot;
  response_value: ResponseValue;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type QuestionnaireResponse = Selectable<QuestionnaireResponsesTable>;
export type NewQuestionnaireResponse = Insertable<QuestionnaireResponsesTable>;
export type QuestionnaireResponseUpdate = Updateable<QuestionnaireResponsesTable>;
