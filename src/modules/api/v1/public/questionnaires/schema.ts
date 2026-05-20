import {
  OnboardingQuestion,
  OnboardingSchema,
  QuestionnaireAnswers,
} from 'src/database/interfaces';

/**
 * Validates that an `OnboardingSchema` payload is internally consistent.
 *
 *   - Every question has a non-empty `id` and `prompt`.
 *   - `id`s are unique across the form (we key answers by id).
 *   - `single_choice` / `multi_choice` carry at least one option.
 *   - `scale` carries finite `min` <= `max` numeric bounds.
 *   - Option values inside a question are unique.
 *
 * Errors accumulate so the caller can surface them all at once instead of trickling
 * fixes back one at a time.
 */
export function validateOnboardingSchema(schema: unknown): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { ok: false, errors: ['schema must be an object'] };
  }
  const questions = (schema as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) {
    return { ok: false, errors: ['schema.questions must be an array'] };
  }
  const seenIds = new Set<string>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Partial<OnboardingQuestion>;
    const prefix = `questions[${i}]`;
    if (!q || typeof q !== 'object') {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof q.id !== 'string' || q.id.trim() === '') {
      errors.push(`${prefix}.id is required`);
    } else if (seenIds.has(q.id)) {
      errors.push(`${prefix}.id "${q.id}" is duplicated`);
    } else {
      seenIds.add(q.id);
    }
    if (typeof q.prompt !== 'string' || q.prompt.trim() === '') {
      errors.push(`${prefix}.prompt is required`);
    }
    switch (q.type) {
      case 'single_choice':
      case 'multi_choice': {
        if (!Array.isArray(q.options) || q.options.length === 0) {
          errors.push(`${prefix}.options must contain at least one option`);
          break;
        }
        const seenValues = new Set<string>();
        for (let j = 0; j < q.options.length; j++) {
          const opt = q.options[j];
          if (!opt || typeof opt.value !== 'string' || opt.value.trim() === '') {
            errors.push(`${prefix}.options[${j}].value is required`);
            continue;
          }
          if (seenValues.has(opt.value)) {
            errors.push(`${prefix}.options[${j}].value "${opt.value}" is duplicated`);
          }
          seenValues.add(opt.value);
        }
        break;
      }
      case 'scale': {
        if (typeof q.min !== 'number' || typeof q.max !== 'number') {
          errors.push(`${prefix}.min and ${prefix}.max are required (numbers)`);
        } else if (!Number.isFinite(q.min) || !Number.isFinite(q.max) || q.min > q.max) {
          errors.push(`${prefix}.min must be <= ${prefix}.max`);
        }
        break;
      }
      case 'text':
        break;
      default:
        errors.push(`${prefix}.type must be one of single_choice | multi_choice | scale | text`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Walks a (validated) schema + answer payload and returns the flat list of profile
 * tags that the workout generator consumes. Pure function — no DB calls — so the
 * derivation is identical between write-time persistence and ad-hoc previews.
 *
 *   - single_choice → emit the selected option's `tags` (if any)
 *   - multi_choice  → emit every selected option's `tags`
 *   - scale         → apply `tagTemplate` with `{value}` substituted
 *   - text          → never emits tags
 *
 * Unknown question ids in the answer payload are silently ignored: the caller is
 * responsible for validation; tag derivation is forgiving so a partially answered
 * questionnaire still yields whatever tags it can.
 */
export function deriveTags(schema: OnboardingSchema, answers: QuestionnaireAnswers): string[] {
  const tags: string[] = [];
  for (const question of schema.questions) {
    const answer = answers[question.id];
    if (answer === undefined || answer === null) continue;

    switch (question.type) {
      case 'single_choice': {
        const opt = (question.options ?? []).find((o) => o.value === answer);
        if (opt?.tags) tags.push(...opt.tags);
        break;
      }
      case 'multi_choice': {
        if (!Array.isArray(answer)) break;
        const selected = new Set(answer.map(String));
        for (const opt of question.options ?? []) {
          if (selected.has(opt.value) && opt.tags) tags.push(...opt.tags);
        }
        break;
      }
      case 'scale': {
        if (typeof answer !== 'number') break;
        if (
          typeof question.min === 'number' &&
          typeof question.max === 'number' &&
          (answer < question.min || answer > question.max)
        ) {
          break;
        }
        if (question.tagTemplate) {
          tags.push(question.tagTemplate.replace(/\{value\}/g, String(answer)));
        }
        break;
      }
      case 'text':
      default:
        break;
    }
  }
  // De-duplicate while preserving first-seen order (cheap and predictable).
  return Array.from(new Set(tags));
}

/**
 * Lightweight runtime check that the answers payload is shape-compatible with the
 * schema. Catches obvious shape mistakes (string where an array is expected, etc.)
 * before we try to derive tags. Returns the same accumulating-errors shape.
 */
export function validateAnswers(
  schema: OnboardingSchema,
  answers: QuestionnaireAnswers,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map(schema.questions.map((q) => [q.id, q]));
  for (const [id, value] of Object.entries(answers)) {
    const q = byId.get(id);
    if (!q) continue; // unknown ids tolerated — questionnaire may have changed
    switch (q.type) {
      case 'single_choice':
        if (typeof value !== 'string') errors.push(`${id}: expected a string answer`);
        break;
      case 'multi_choice':
        if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
          errors.push(`${id}: expected an array of strings`);
        }
        break;
      case 'scale':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`${id}: expected a finite number`);
        }
        break;
      case 'text':
        if (typeof value !== 'string') errors.push(`${id}: expected a string answer`);
        break;
    }
  }
  for (const q of schema.questions) {
    if (q.required && (answers[q.id] === undefined || answers[q.id] === null || answers[q.id] === '')) {
      errors.push(`${q.id}: required`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
