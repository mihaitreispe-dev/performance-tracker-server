import {
  advanceStreak,
  applyFreezeEarnings,
  levelForXp,
  levelProgress,
  StreakState,
  xpForLevel,
} from './progression.math';

describe('progression level curve', () => {
  it('levelForXp inverts xpForLevel at the thresholds', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(xpForLevel(2))).toBe(2); // 100
    expect(levelForXp(xpForLevel(2) - 1)).toBe(1);
    expect(levelForXp(xpForLevel(5))).toBe(5); // 1000
    expect(levelForXp(xpForLevel(10))).toBe(10); // 4500
  });

  it('levelProgress reports the fill within the current level', () => {
    const p = levelProgress(xpForLevel(2));
    expect(p.level).toBe(2);
    expect(p.xpIntoLevel).toBe(0);
    expect(p.xpForNextLevel).toBe(xpForLevel(3) - xpForLevel(2)); // 200
  });
});

describe('forgiving streak', () => {
  const base: StreakState = {
    currentStreak: 0,
    longestStreak: 0,
    lastActiveDate: null,
    graceRemaining: 1,
    freezesRemaining: 0,
  };

  it('first activity starts a streak of 1', () => {
    const r = advanceStreak(base, '2026-06-01');
    expect(r.currentStreak).toBe(1);
    expect(r.changed).toBe(true);
  });

  it('same day does not change the streak', () => {
    const r = advanceStreak({ ...base, currentStreak: 3, lastActiveDate: '2026-06-03' }, '2026-06-03');
    expect(r.currentStreak).toBe(3);
    expect(r.changed).toBe(false);
  });

  it('a consecutive day increments', () => {
    const r = advanceStreak({ ...base, currentStreak: 3, lastActiveDate: '2026-06-03' }, '2026-06-04');
    expect(r.currentStreak).toBe(4);
    expect(r.changed).toBe(true);
  });

  it('a single missed day is forgiven by a grace token', () => {
    const r = advanceStreak(
      { ...base, currentStreak: 3, lastActiveDate: '2026-06-03', graceRemaining: 1 },
      '2026-06-05',
    );
    expect(r.currentStreak).toBe(4);
    expect(r.graceRemaining).toBe(0);
    expect(r.changed).toBe(true);
  });

  it('a single missed day with no grace resets', () => {
    const r = advanceStreak(
      { ...base, currentStreak: 3, lastActiveDate: '2026-06-03', graceRemaining: 0 },
      '2026-06-05',
    );
    expect(r.currentStreak).toBe(1);
    expect(r.changed).toBe(true);
  });

  it('two missed days reset regardless of grace', () => {
    const r = advanceStreak(
      { ...base, currentStreak: 9, lastActiveDate: '2026-06-03', graceRemaining: 1 },
      '2026-06-06',
    );
    expect(r.currentStreak).toBe(1);
    expect(r.graceRemaining).toBe(1); // grace untouched on a hard reset
  });

  it('a clean week refills the grace token', () => {
    const r = advanceStreak(
      { ...base, currentStreak: 6, lastActiveDate: '2026-06-06', graceRemaining: 0 },
      '2026-06-07',
    );
    expect(r.currentStreak).toBe(7);
    expect(r.graceRemaining).toBe(1);
  });

  it('tracks the longest streak', () => {
    const r = advanceStreak(
      { currentStreak: 5, longestStreak: 12, lastActiveDate: '2026-06-03', graceRemaining: 1, freezesRemaining: 0 },
      '2026-06-04',
    );
    expect(r.currentStreak).toBe(6);
    expect(r.longestStreak).toBe(12);
  });

  it('a freeze saves the streak when grace is gone (1-day gap)', () => {
    const r = advanceStreak(
      { ...base, currentStreak: 3, lastActiveDate: '2026-06-03', graceRemaining: 0, freezesRemaining: 1 },
      '2026-06-05',
    );
    expect(r.currentStreak).toBe(4);
    expect(r.freezesRemaining).toBe(0);
  });

  it('a freeze bridges a multi-day lapse (grace alone cannot)', () => {
    const r = advanceStreak(
      { ...base, currentStreak: 9, lastActiveDate: '2026-06-03', graceRemaining: 1, freezesRemaining: 2 },
      '2026-06-07',
    );
    expect(r.currentStreak).toBe(10);
    expect(r.freezesRemaining).toBe(1);
    expect(r.graceRemaining).toBe(1); // grace untouched — only the freeze was spent
  });

  it('with no grace and no freeze, a lapse resets', () => {
    const r = advanceStreak(
      { ...base, currentStreak: 9, lastActiveDate: '2026-06-03', graceRemaining: 0, freezesRemaining: 0 },
      '2026-06-07',
    );
    expect(r.currentStreak).toBe(1);
  });
});

describe('freeze earnings', () => {
  it('grants a freeze every 5 levels, capped at FREEZE_MAX', () => {
    expect(applyFreezeEarnings(0, 4, 5)).toBe(1); // crossed level 5
    expect(applyFreezeEarnings(0, 5, 6)).toBe(0); // no boundary crossed
    expect(applyFreezeEarnings(0, 9, 10)).toBe(1); // crossed level 10
    expect(applyFreezeEarnings(3, 9, 10)).toBe(3); // already capped
    expect(applyFreezeEarnings(0, 4, 15)).toBe(3); // crossed 5/10/15 → 3, capped
  });
});
