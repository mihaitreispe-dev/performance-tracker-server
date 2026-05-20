import { OnboardingSchema } from 'src/database/interfaces';

import { deriveTags, validateAnswers, validateOnboardingSchema } from './schema';

const SCHEMA: OnboardingSchema = {
  questions: [
    {
      id: 'level',
      type: 'single_choice',
      prompt: 'Experience level?',
      options: [
        { value: 'beginner', tags: ['level:beginner'] },
        { value: 'intermediate', tags: ['level:intermediate'] },
        { value: 'advanced', tags: ['level:advanced'] },
      ],
    },
    {
      id: 'equipment',
      type: 'multi_choice',
      prompt: 'Equipment?',
      options: [
        { value: 'dumbbells', tags: ['equipment:dumbbells'] },
        { value: 'barbell', tags: ['equipment:barbell'] },
        { value: 'bodyweight', tags: ['equipment:bodyweight'] },
      ],
    },
    {
      id: 'minutes',
      type: 'scale',
      prompt: 'Minutes per session?',
      min: 15,
      max: 90,
      tagTemplate: 'time_per_session:{value}',
    },
    {
      id: 'notes',
      type: 'text',
      prompt: 'Anything else?',
      required: false,
    },
  ],
};

describe('validateOnboardingSchema', () => {
  it('accepts a sound schema', () => {
    expect(validateOnboardingSchema(SCHEMA)).toEqual({ ok: true });
  });

  it('rejects non-object input', () => {
    expect(validateOnboardingSchema(null)).toEqual({ ok: false, errors: ['schema must be an object'] });
    expect(validateOnboardingSchema([])).toEqual({ ok: false, errors: ['schema must be an object'] });
  });

  it('rejects when questions is not an array', () => {
    expect(validateOnboardingSchema({ questions: 'nope' })).toEqual({
      ok: false,
      errors: ['schema.questions must be an array'],
    });
  });

  it('reports duplicate question ids', () => {
    const dup: OnboardingSchema = {
      questions: [
        { id: 'a', type: 'text', prompt: 'q1' },
        { id: 'a', type: 'text', prompt: 'q2' },
      ],
    };
    const result = validateOnboardingSchema(dup);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('questions[1].id "a" is duplicated');
  });

  it('reports unknown question types', () => {
    const bad = { questions: [{ id: 'a', type: 'rating', prompt: 'q' }] };
    const result = validateOnboardingSchema(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('|')).toMatch(/questions\[0\].type/);
  });

  it('requires options on choice questions', () => {
    const bad = { questions: [{ id: 'a', type: 'single_choice', prompt: 'q' }] };
    const result = validateOnboardingSchema(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('questions[0].options must contain at least one option');
  });

  it('requires min/max ordering on scale questions', () => {
    const bad = { questions: [{ id: 'a', type: 'scale', prompt: 'q', min: 10, max: 5 }] };
    const result = validateOnboardingSchema(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('questions[0].min must be <= questions[0].max');
  });

  it('reports duplicate option values inside a question', () => {
    const bad: OnboardingSchema = {
      questions: [
        {
          id: 'a',
          type: 'single_choice',
          prompt: 'q',
          options: [
            { value: 'x' },
            { value: 'x' },
          ],
        },
      ],
    };
    const result = validateOnboardingSchema(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('|')).toMatch(/duplicated/);
  });
});

describe('deriveTags', () => {
  it('emits the selected single-choice option tags', () => {
    expect(deriveTags(SCHEMA, { level: 'intermediate' })).toEqual(['level:intermediate']);
  });

  it('emits tags for every selected multi-choice value', () => {
    expect(deriveTags(SCHEMA, { equipment: ['dumbbells', 'bodyweight'] })).toEqual(
      expect.arrayContaining(['equipment:dumbbells', 'equipment:bodyweight']),
    );
  });

  it('applies scale tag template with the numeric value', () => {
    expect(deriveTags(SCHEMA, { minutes: 45 })).toEqual(['time_per_session:45']);
  });

  it('skips scale values outside the declared bounds', () => {
    expect(deriveTags(SCHEMA, { minutes: 5 })).toEqual([]);
  });

  it('never emits tags for free-text answers', () => {
    expect(deriveTags(SCHEMA, { notes: 'hello' })).toEqual([]);
  });

  it('de-duplicates while preserving first-seen order', () => {
    const schema: OnboardingSchema = {
      questions: [
        {
          id: 'a',
          type: 'multi_choice',
          prompt: 'q',
          options: [
            { value: 'x', tags: ['t:1'] },
            { value: 'y', tags: ['t:1', 't:2'] },
          ],
        },
      ],
    };
    expect(deriveTags(schema, { a: ['x', 'y'] })).toEqual(['t:1', 't:2']);
  });

  it('walks every question and produces the full tag bag', () => {
    const out = deriveTags(SCHEMA, {
      level: 'beginner',
      equipment: ['dumbbells'],
      minutes: 30,
      notes: 'hi',
    });
    expect(out.sort()).toEqual(['equipment:dumbbells', 'level:beginner', 'time_per_session:30'].sort());
  });

  it('tolerates unknown question ids in the answer payload', () => {
    expect(deriveTags(SCHEMA, { level: 'beginner', ghost: 'irrelevant' as never })).toEqual(['level:beginner']);
  });
});

describe('validateAnswers', () => {
  it('passes well-formed answers', () => {
    const result = validateAnswers(SCHEMA, {
      level: 'beginner',
      equipment: ['dumbbells'],
      minutes: 30,
      notes: 'x',
    });
    expect(result).toEqual({ ok: true });
  });

  it('rejects type-mismatched answers', () => {
    const result = validateAnswers(SCHEMA, {
      level: ['wrong'] as unknown as string,
      equipment: 'should-be-array' as unknown as string[],
      minutes: 'NaN' as unknown as number,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          'level: expected a string answer',
          'equipment: expected an array of strings',
          'minutes: expected a finite number',
        ]),
      );
    }
  });

  it('flags missing required answers', () => {
    const schema: OnboardingSchema = {
      questions: [{ id: 'goal', type: 'single_choice', prompt: 'q', options: [{ value: 'x' }], required: true }],
    };
    const result = validateAnswers(schema, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('goal: required');
  });
});
