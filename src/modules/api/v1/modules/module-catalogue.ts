import { ModuleKey } from 'src/database/interfaces';

export interface ModuleCatalogueEntry {
  key: ModuleKey;
  name: string;
  description: string;
  defaultEnabled: boolean;
  sortOrder: number;
}

/**
 * The v1 module catalogue. The seeder upserts these rows into the `modules` table at boot.
 * Adding a new module: add an entry here, deploy the server, and the row appears.
 */
export const MODULE_CATALOGUE: readonly ModuleCatalogueEntry[] = [
  { key: ModuleKey.WORKOUTS, name: 'Workouts', description: 'Workout library and execution', defaultEnabled: true, sortOrder: 10 },
  { key: ModuleKey.WORKOUT_PLANS, name: 'Workout Plans', description: 'Multi-week training plans', defaultEnabled: true, sortOrder: 20 },
  { key: ModuleKey.WORKOUT_SCHEDULES, name: 'Workout Schedules', description: 'Calendar-based scheduling', defaultEnabled: true, sortOrder: 30 },
  { key: ModuleKey.EXERCISES, name: 'Exercises', description: 'Exercise library with cues and demos', defaultEnabled: true, sortOrder: 40 },
  { key: ModuleKey.MOVEMENT_SNACKS, name: 'Movement Snacks', description: '8-10 minute guided movement clips', defaultEnabled: true, sortOrder: 50 },
  { key: ModuleKey.COURSES, name: 'Courses', description: 'Educational video-based courses', defaultEnabled: true, sortOrder: 60 },
];
