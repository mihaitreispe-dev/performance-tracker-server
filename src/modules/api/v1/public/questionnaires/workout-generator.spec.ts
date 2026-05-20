import { parseTags } from './workout-generator';

describe('parseTags', () => {
  it('picks level + goal from the tag bag', () => {
    expect(parseTags(['level:advanced', 'goal:strength'])).toMatchObject({
      level: 'advanced',
      goal: 'strength',
    });
  });

  it('falls back to beginner / hypertrophy defaults', () => {
    expect(parseTags([])).toMatchObject({ level: 'beginner', goal: 'hypertrophy' });
  });

  it('ignores tags with unknown values for known keys', () => {
    expect(parseTags(['level:guru', 'goal:powerlifting'])).toMatchObject({
      level: 'beginner',
      goal: 'hypertrophy',
    });
  });

  it('parses time_per_session into a number', () => {
    expect(parseTags(['time_per_session:45'])).toMatchObject({ timePerSessionMin: 45 });
  });

  it('rejects non-numeric time_per_session', () => {
    expect(parseTags(['time_per_session:lots'])).toMatchObject({ timePerSessionMin: null });
  });

  it('accumulates equipment and avoid tags into sets', () => {
    const parsed = parseTags([
      'equipment:dumbbells',
      'equipment:barbell',
      'avoid:knee',
      'avoid:lower_back',
    ]);
    expect(Array.from(parsed.equipment).sort()).toEqual(['barbell', 'dumbbells']);
    expect(Array.from(parsed.avoid).sort()).toEqual(['knee', 'lower_back']);
  });

  it('tolerates tags with extra colons (uses the first as the separator)', () => {
    // "goal:something:weird" parses as key=goal, value=something:weird (unknown value
    // — falls back). This protects us from breaking if we add a tag later that uses
    // colons in the value half.
    expect(parseTags(['goal:something:weird'])).toMatchObject({ goal: 'hypertrophy' });
  });

  it('silently ignores malformed (no colon) tags', () => {
    expect(() => parseTags(['malformed', 'level:beginner'])).not.toThrow();
    expect(parseTags(['malformed', 'level:beginner']).level).toBe('beginner');
  });
});
