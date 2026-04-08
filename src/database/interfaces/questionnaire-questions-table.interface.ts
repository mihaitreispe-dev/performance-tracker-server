import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { Timestamp } from './timestamp';

export const QuestionType = {
  SINGLE_CHOICE: 'single_choice',
  MULTI_CHOICE: 'multi_choice',
  RATING_SCALE: 'rating_scale',
  SLIDER: 'slider',
  SHORT_TEXT: 'short_text',
  LONG_TEXT: 'long_text',
  YES_NO: 'yes_no',
  DATE: 'date',
  NUMBER: 'number',
  BODY_PART: 'body_part',
  RPE: 'rpe',
  MOOD: 'mood',
} as const;

export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

// Configuration types for each question type
export interface SingleChoiceConfig {
  options: { value: string; label: string }[];
}

export interface MultiChoiceConfig {
  options: { value: string; label: string }[];
  minSelections?: number;
  maxSelections?: number;
}

export interface RatingScaleConfig {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface SliderConfig {
  min: number;
  max: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  unit?: string;
}

export interface ShortTextConfig {
  maxLength?: number;
  placeholder?: string;
}

export interface LongTextConfig {
  maxLength?: number;
  placeholder?: string;
  rows?: number;
}

export interface YesNoConfig {
  yesLabel?: string;
  noLabel?: string;
}

export interface DateConfig {
  minDate?: string;
  maxDate?: string;
  allowFuture?: boolean;
  allowPast?: boolean;
}

export interface NumberConfig {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
}

export interface BodyPartConfig {
  allowMultiple?: boolean;
  availableParts?: string[];
}

export interface RpeConfig {
  scale?: '1-10' | '6-20';
  showDescriptions?: boolean;
}

export interface MoodConfig {
  options?: { value: string; emoji: string; label: string }[];
}

export type QuestionConfig =
  | SingleChoiceConfig
  | MultiChoiceConfig
  | RatingScaleConfig
  | SliderConfig
  | ShortTextConfig
  | LongTextConfig
  | YesNoConfig
  | DateConfig
  | NumberConfig
  | BodyPartConfig
  | RpeConfig
  | MoodConfig
  | null;

export interface QuestionnaireQuestionsTable {
  id: Generated<string>;
  template_id: string;
  question_text: string;
  question_type: QuestionType;
  is_required: Generated<boolean>;
  order_index: Generated<number>;
  config: QuestionConfig;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type QuestionnaireQuestion = Selectable<QuestionnaireQuestionsTable>;
export type NewQuestionnaireQuestion = Insertable<QuestionnaireQuestionsTable>;
export type QuestionnaireQuestionUpdate = Updateable<QuestionnaireQuestionsTable>;
