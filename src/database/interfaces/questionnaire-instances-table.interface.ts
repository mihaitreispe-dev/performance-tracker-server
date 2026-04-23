import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

import type { QuestionConfig, QuestionType } from './questionnaire-questions-table.interface';
import type { QuestionnaireCategory } from './questionnaire-templates-table.interface';
import type { Timestamp } from './timestamp';

export const QuestionnaireStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
} as const;

export type QuestionnaireStatus = (typeof QuestionnaireStatus)[keyof typeof QuestionnaireStatus];

// Snapshot of a question at send time
export interface QuestionSnapshot {
  id: string;
  questionText: string;
  questionType: QuestionType;
  isRequired: boolean;
  orderIndex: number;
  config: QuestionConfig;
}

// Snapshot of the entire template at send time
export interface TemplateSnapshot {
  id: string;
  name: string;
  description: string | null;
  category: QuestionnaireCategory;
  questions: QuestionSnapshot[];
}

export interface QuestionnaireInstancesTable {
  id: Generated<string>;
  template_id: string | null;
  relationship_id: string;
  coach_id: string;
  athlete_id: string;
  message_id: string | null;
  status: Generated<QuestionnaireStatus>;
  sent_at: Generated<Timestamp>;
  started_at: Timestamp | null;
  completed_at: Timestamp | null;
  expires_at: Timestamp | null;
  template_snapshot: TemplateSnapshot;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type QuestionnaireInstance = Selectable<QuestionnaireInstancesTable>;
export type NewQuestionnaireInstance = Insertable<QuestionnaireInstancesTable>;
export type QuestionnaireInstanceUpdate = Updateable<QuestionnaireInstancesTable>;
