import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum BodyPart {
  HEAD = 'head',
  NECK = 'neck',
  LEFT_SHOULDER = 'left_shoulder',
  RIGHT_SHOULDER = 'right_shoulder',
  LEFT_UPPER_ARM = 'left_upper_arm',
  RIGHT_UPPER_ARM = 'right_upper_arm',
  LEFT_ELBOW = 'left_elbow',
  RIGHT_ELBOW = 'right_elbow',
  LEFT_FOREARM = 'left_forearm',
  RIGHT_FOREARM = 'right_forearm',
  LEFT_WRIST = 'left_wrist',
  RIGHT_WRIST = 'right_wrist',
  LEFT_HAND = 'left_hand',
  RIGHT_HAND = 'right_hand',
  CHEST = 'chest',
  UPPER_BACK = 'upper_back',
  LOWER_BACK = 'lower_back',
  ABDOMEN = 'abdomen',
  LEFT_HIP = 'left_hip',
  RIGHT_HIP = 'right_hip',
  LEFT_GLUTE = 'left_glute',
  RIGHT_GLUTE = 'right_glute',
  LEFT_THIGH = 'left_thigh',
  RIGHT_THIGH = 'right_thigh',
  LEFT_HAMSTRING = 'left_hamstring',
  RIGHT_HAMSTRING = 'right_hamstring',
  LEFT_KNEE = 'left_knee',
  RIGHT_KNEE = 'right_knee',
  LEFT_SHIN = 'left_shin',
  RIGHT_SHIN = 'right_shin',
  LEFT_CALF = 'left_calf',
  RIGHT_CALF = 'right_calf',
  LEFT_ANKLE = 'left_ankle',
  RIGHT_ANKLE = 'right_ankle',
  LEFT_FOOT = 'left_foot',
  RIGHT_FOOT = 'right_foot',
  LEFT_HEEL = 'left_heel',
  RIGHT_HEEL = 'right_heel',
  LEFT_ARCH = 'left_arch',
  RIGHT_ARCH = 'right_arch',
  LEFT_TOES = 'left_toes',
  RIGHT_TOES = 'right_toes',
}

export enum BodyView {
  FRONT = 'front',
  BACK = 'back',
  LEFT_FOOT = 'left_foot',
  RIGHT_FOOT = 'right_foot',
}

export enum PainTrend {
  DECREASING = 'decreasing',
  CONSTANT = 'constant',
  INCREASING = 'increasing',
}

export enum InjuryType {
  ACUTE = 'acute',
  CHRONIC = 'chronic',
  OVERUSE = 'overuse',
}

export interface PainLogsTable {
  id: Generated<string>;
  user_id: string;
  workout_execution_id: string;
  body_part: BodyPart;
  body_view: BodyView;
  pain_level: number; // 1-10
  pain_duration_start: number; // 0-100 (percentage of workout)
  pain_duration_end: number; // 0-100 (percentage of workout)
  pain_trend: PainTrend;
  notes: string | null;
  is_injury: Generated<boolean>;
  injury_type: InjuryType | null;
  expected_recovery_days: number | null;
  coach_notified_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type PainLog = Selectable<PainLogsTable>;
export type NewPainLog = Insertable<PainLogsTable>;
export type PainLogUpdate = Updateable<PainLogsTable>;
