/**
 * Pure progression math — no Nest, no DB — so it can be unit-tested directly.
 *
 * Level curve: a triangular cumulative curve so per-level cost grows smoothly.
 * Total XP required to REACH level L is `XP_BASE * (L-1) * L / 2`:
 *   L1=0, L2=100, L3=300, L5=1000, L10=4500, L20=19000.
 * Tuned against the award sizes below, a daily user (~1 workout + 1 snack ≈
 * 65 XP/day) reaches ~level 10 around 60 active days — so level 10 is the
 * "habit established" milestone, matching the research's ~60-day median.
 */
export const XP_BASE = 100;
export const WORKOUT_XP = 50;
export const WORKOUT_PARTIAL_XP = 25;
export const SNACK_XP = 15;
export const HABIT_ESTABLISHED_LEVEL = 10;

/** Total XP required to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return (XP_BASE * (level - 1) * level) / 2;
}

/** Level for a given lifetime XP (inverse of xpForLevel). */
export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / XP_BASE)) / 2));
}

export interface LevelProgress {
  level: number;
  /** XP accumulated within the current level. */
  xpIntoLevel: number;
  /** XP span of the current level (xpIntoLevel / xpForNextLevel = bar fill). */
  xpForNextLevel: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return { level, xpIntoLevel: xp - floor, xpForNextLevel: ceil - floor };
}

// ---- forgiving streak -----------------------------------------------------

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null; // 'YYYY-MM-DD'
  graceRemaining: number;
  freezesRemaining: number;
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  graceRemaining: number;
  freezesRemaining: number;
  /** True when `today` is a newly-counted active day (drives the active_days goal). */
  changed: boolean;
}

/** Earned freeze economy: one freeze per N levels, capped. */
export const FREEZE_MAX = 3;
export const FREEZE_EVERY_LEVELS = 5;

/** Freezes earned by crossing level-up boundaries, returning the capped balance. */
export function applyFreezeEarnings(current: number, oldLevel: number, newLevel: number): number {
  const earned =
    Math.floor(newLevel / FREEZE_EVERY_LEVELS) - Math.floor(oldLevel / FREEZE_EVERY_LEVELS);
  return Math.min(FREEZE_MAX, current + Math.max(0, earned));
}

/**
 * Normalize a DATE value to a 'YYYY-MM-DD' calendar string. The pg driver
 * returns DATE columns as a JS Date at local midnight, so we read it back via
 * local components (round-trips the stored calendar date regardless of tz);
 * strings are passed through (sliced to the date part).
 */
export function toDayString(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const y = v.getFullYear();
  const m = String(v.getMonth() + 1).padStart(2, '0');
  const d = String(v.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDay(d: string): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

/** Whole-day difference between two 'YYYY-MM-DD' dates (to - from). */
function dayDiff(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / 86_400_000);
}

/**
 * Advance a forgiving, day-based streak given `today`:
 *   - same day            → no change (already counted today)
 *   - consecutive day     → +1
 *   - exactly one gap day  → consume a grace token and keep the streak (+1)
 *   - >1 gap, or no grace  → reset to 1
 * Each clean week (streak crossing a multiple of 7) refills the single grace
 * token. This keeps a Mon/Wed/Fri cadence alive — the rehab-safe behaviour.
 */
export function advanceStreak(prev: StreakState, today: string): StreakResult {
  let current = prev.currentStreak;
  let grace = prev.graceRemaining;
  let freezes = prev.freezesRemaining;
  let changed = false;

  if (!prev.lastActiveDate) {
    current = 1;
    changed = true;
  } else {
    const gap = dayDiff(prev.lastActiveDate, today);
    if (gap <= 0) {
      changed = false; // same day (or clock skew) — already counted
    } else if (gap === 1) {
      current += 1;
      changed = true;
    } else if (gap === 2 && grace > 0) {
      grace -= 1; // one missed day, forgiven by the auto-grace
      current += 1;
      changed = true;
    } else if (freezes > 0) {
      freezes -= 1; // any lapse, saved by an earned freeze (after grace)
      current += 1;
      changed = true;
    } else {
      current = 1; // reset; today counts as day 1
      changed = true;
    }
  }

  // A clean week earns the grace token back (capped at 1).
  if (changed && current % 7 === 0) grace = Math.max(grace, 1);

  return {
    currentStreak: current,
    longestStreak: Math.max(prev.longestStreak, current),
    lastActiveDate: changed ? today : (prev.lastActiveDate ?? today),
    graceRemaining: grace,
    freezesRemaining: freezes,
    changed,
  };
}
