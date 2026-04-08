import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { Timestamp } from './timestamp';

export const QuestionnaireCategory = {
  WELLNESS: 'wellness',
  RECOVERY: 'recovery',
  TRAINING: 'training',
  INJURY: 'injury',
  NUTRITION: 'nutrition',
  MENTAL: 'mental',
  GENERAL: 'general',
  CUSTOM: 'custom',
} as const;

export type QuestionnaireCategory = (typeof QuestionnaireCategory)[keyof typeof QuestionnaireCategory];

export interface QuestionnaireTemplatesTable {
  id: Generated<string>;
  coach_id: string;
  name: string;
  description: string | null;
  category: QuestionnaireCategory;
  is_archived: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type QuestionnaireTemplate = Selectable<QuestionnaireTemplatesTable>;
export type NewQuestionnaireTemplate = Insertable<QuestionnaireTemplatesTable>;
export type QuestionnaireTemplateUpdate = Updateable<QuestionnaireTemplatesTable>;
