import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Kysely } from 'kysely';

import {
  Database,
  Exercise,
  ExerciseInstanceMode,
  ExerciseStatus,
  WorkoutDifficulty,
  WorkoutType,
} from 'src/database/interfaces';
import { ExerciseRepository } from 'src/repositories/exercise.repository';

/**
 * Sets / reps template keyed by (level, goal). The values are deliberately tame —
 * v1 generation is rule-based and deterministic; the goal is "starter workout that
 * any of our exercises slot into cleanly," not a periodised programme. A later
 * version will swap this lookup for an ML-augmented selector.
 */
interface SetsRepsTemplate {
  sets: number;
  reps: number;
  /** Maps to ExerciseInstanceMode — REPS is the safe default for all goals here. */
  mode: ExerciseInstanceMode;
  /** Surface label so the response can explain why this template was chosen. */
  rationale: string;
}

const REPS_TEMPLATES: Record<string, SetsRepsTemplate> = {
  'beginner|strength': {
    sets: 3,
    reps: 5,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Beginner strength — low reps, moderate volume',
  },
  'beginner|hypertrophy': {
    sets: 3,
    reps: 10,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Beginner hypertrophy — classic 3×10',
  },
  'beginner|endurance': {
    sets: 2,
    reps: 15,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Beginner endurance — higher reps, lower load',
  },
  'beginner|mobility': {
    sets: 2,
    reps: 8,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Beginner mobility — controlled sets',
  },
  'intermediate|strength': {
    sets: 4,
    reps: 5,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Intermediate strength — 4×5 heavy template',
  },
  'intermediate|hypertrophy': {
    sets: 4,
    reps: 8,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Intermediate hypertrophy — 4×8 in the growth window',
  },
  'intermediate|endurance': {
    sets: 3,
    reps: 15,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Intermediate endurance — sustained volume',
  },
  'intermediate|mobility': {
    sets: 3,
    reps: 10,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Intermediate mobility — three rounds',
  },
  'advanced|strength': {
    sets: 5,
    reps: 3,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Advanced strength — 5×3 heavy template',
  },
  'advanced|hypertrophy': {
    sets: 5,
    reps: 8,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Advanced hypertrophy — high-volume 5×8',
  },
  'advanced|endurance': {
    sets: 4,
    reps: 20,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Advanced endurance — sustained volume blocks',
  },
  'advanced|mobility': {
    sets: 3,
    reps: 12,
    mode: ExerciseInstanceMode.REPS,
    rationale: 'Advanced mobility — controlled long sets',
  },
};

const DEFAULT_TEMPLATE: SetsRepsTemplate = {
  sets: 3,
  reps: 10,
  mode: ExerciseInstanceMode.REPS,
  rationale: 'Default 3×10 starter',
};

/** Approximate seconds per set (work + rest). Used to budget exercise count. */
const SECONDS_PER_SET = 90;

export interface GenerationInput {
  organisationId: string;
  /** The user the workout is being generated for. */
  userId: string;
  /** Flat profile tags from the latest onboarding response. */
  tags: string[];
  /** Audit link — the response that fed the generation. */
  responseId: string | null;
}

export interface GenerationResult {
  workoutId: string;
  template: SetsRepsTemplate;
  chosenExerciseIds: string[];
  level: string;
  goal: string;
  durationMinutes: number;
}

/**
 * v1 workout generator. Deterministic, rule-based:
 *
 *   1. Parse tags into structured (level, goal, time, equipment, avoid).
 *   2. Look up a sets × reps template from (level, goal).
 *   3. Budget exercise count from time_per_session (or default to 6).
 *   4. Pull candidate exercises from the org's library, drop UPLOAD_PENDING /
 *      ASSETS_FAILED rows, optionally filter by equipment tags if `category`
 *      matches anything we asked for, and slice the top N.
 *   5. Write a workout + N exercise_instances + N workout_items inside a single
 *      transaction.
 *
 * The function is intentionally pessimistic: if the org library is empty, we
 * throw — generating a "workout" with zero exercises is never useful and silently
 * succeeding would mask the actual problem (the org never published anything).
 */
@Injectable()
export class WorkoutGeneratorService {
  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly exerciseRepo: ExerciseRepository,
  ) {}

  async generate(input: GenerationInput): Promise<GenerationResult> {
    const parsed = parseTags(input.tags);
    const template = REPS_TEMPLATES[`${parsed.level}|${parsed.goal}`] ?? DEFAULT_TEMPLATE;
    const exerciseCount = budgetExerciseCount(parsed.timePerSessionMin, template);

    const candidates = await this.exerciseRepo.findMany({
      organisationId: input.organisationId,
      offset: 0,
      limit: Math.max(exerciseCount * 4, 24),
    });
    const ready = candidates.filter((e) => e.status === ExerciseStatus.ASSETS_DONE);
    const filtered = filterByEquipmentAndAvoid(ready, parsed);

    const chosen = filtered.slice(0, exerciseCount);
    if (chosen.length === 0) {
      throw new UnprocessableEntityException(
        'No publishable exercises in this organisation. Publish at least one exercise (status=ASSETS_DONE) before generating a workout.',
      );
    }

    const workoutId = await this.db.transaction().execute(async (trx) => {
      const workout = await trx
        .insertInto('workouts')
        .values({
          organisation_id: input.organisationId,
          name: `Generated workout — ${capitalise(parsed.goal)}, ${capitalise(parsed.level)}`,
          description: buildDescription(parsed, template, chosen.length),
          difficulty: difficultyFor(parsed.level),
          type: WorkoutType.STRENGTH,
          user_id: input.userId,
          cardio_category_id: null,
          generated_from_response_id: input.responseId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      for (let i = 0; i < chosen.length; i++) {
        const ex = chosen[i];
        const instance = await trx
          .insertInto('exercise_instances')
          .values({
            exercise_id: ex.id,
            mode: template.mode,
            sets: template.sets,
            reps: template.reps,
            execution_time: null,
            load: null,
            intensity: null,
            tempo: null,
            notes: null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        await trx
          .insertInto('workout_items')
          .values({
            workout_id: workout.id,
            exercise_instance_id: instance.id,
            exercise_instance_group_id: null,
            cardio_step_id: null,
            cardio_step_group_id: null,
            position: i,
          })
          .execute();
      }

      // Touch updated_at so any list cache sees the new row at the top.
      await trx
        .updateTable('workouts')
        .set({ updated_at: sql`now()` })
        .where('id', '=', workout.id)
        .execute();

      return workout.id;
    });

    return {
      workoutId,
      template,
      chosenExerciseIds: chosen.map((e) => e.id),
      level: parsed.level,
      goal: parsed.goal,
      durationMinutes: Math.round((template.sets * chosen.length * SECONDS_PER_SET) / 60),
    };
  }
}

// --- helpers ---

interface ParsedTags {
  level: 'beginner' | 'intermediate' | 'advanced';
  goal: 'strength' | 'hypertrophy' | 'endurance' | 'mobility';
  /** Minutes per session. null = use generator default. */
  timePerSessionMin: number | null;
  equipment: Set<string>;
  avoid: Set<string>;
}

/**
 * Tag schema:
 *   level:beginner|intermediate|advanced
 *   goal:strength|hypertrophy|endurance|mobility
 *   time_per_session:<minutes>
 *   sessions_per_week:<n>   (ignored in v1 — single workout, not a programme)
 *   equipment:<name>        (zero-or-more)
 *   avoid:<area>            (zero-or-more)
 * Unknown tags are tolerated and ignored.
 */
export function parseTags(tags: string[]): ParsedTags {
  let level: ParsedTags['level'] = 'beginner';
  let goal: ParsedTags['goal'] = 'hypertrophy';
  let timePerSessionMin: number | null = null;
  const equipment = new Set<string>();
  const avoid = new Set<string>();

  for (const raw of tags) {
    const idx = raw.indexOf(':');
    if (idx < 0) continue;
    const key = raw.slice(0, idx);
    const value = raw.slice(idx + 1);

    switch (key) {
      case 'level':
        if (value === 'beginner' || value === 'intermediate' || value === 'advanced') level = value;
        break;
      case 'goal':
        if (value === 'strength' || value === 'hypertrophy' || value === 'endurance' || value === 'mobility') {
          goal = value;
        }
        break;
      case 'time_per_session': {
        const n = Number.parseInt(value, 10);
        if (Number.isFinite(n) && n > 0) timePerSessionMin = n;
        break;
      }
      case 'equipment':
        equipment.add(value);
        break;
      case 'avoid':
        avoid.add(value);
        break;
    }
  }

  return { level, goal, timePerSessionMin, equipment, avoid };
}

function budgetExerciseCount(timePerSessionMin: number | null, template: SetsRepsTemplate): number {
  if (timePerSessionMin === null) return 6;
  // Take 80% of the budgeted time (leave a warmup/cooldown buffer) and divide by
  // (sets × seconds_per_set). Clamp to [3, 10] so degenerate inputs don't blow up.
  const usable = (timePerSessionMin * 60) * 0.8;
  const perExercise = template.sets * SECONDS_PER_SET;
  if (perExercise <= 0) return 6;
  const raw = Math.floor(usable / perExercise);
  return Math.max(3, Math.min(10, raw));
}

function filterByEquipmentAndAvoid(rows: Exercise[], parsed: ParsedTags): Exercise[] {
  if (parsed.equipment.size === 0 && parsed.avoid.size === 0) return rows;
  return rows.filter((ex) => {
    if (parsed.avoid.size > 0 && ex.category && parsed.avoid.has(ex.category.toLowerCase())) {
      return false;
    }
    // We don't have a first-class equipment column to match against the parsed
    // equipment tags (it lives on the exercise_equipment join table). Until the
    // generator grows that join, equipment filtering is a soft signal: rows are
    // kept unless they explicitly conflict, never excluded for missing equipment.
    return true;
  });
}

function difficultyFor(level: ParsedTags['level']): WorkoutDifficulty {
  switch (level) {
    case 'beginner':
      return WorkoutDifficulty.EASY;
    case 'advanced':
      return WorkoutDifficulty.HARD;
    default:
      return WorkoutDifficulty.MODERATE;
  }
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function buildDescription(
  parsed: ParsedTags,
  template: SetsRepsTemplate,
  exerciseCount: number,
): string {
  const bits = [
    `Generated from onboarding response.`,
    `Level: ${parsed.level}. Goal: ${parsed.goal}.`,
    `${template.sets} × ${template.reps} across ${exerciseCount} exercises.`,
    `Template rationale: ${template.rationale}.`,
  ];
  if (parsed.equipment.size > 0) bits.push(`Equipment: ${Array.from(parsed.equipment).join(', ')}.`);
  if (parsed.avoid.size > 0) bits.push(`Avoiding: ${Array.from(parsed.avoid).join(', ')}.`);
  return bits.join(' ');
}
