/**
 * Avatar cosmetics catalog (server source of truth for unlock VALIDATION only).
 *
 * Cosmetics are rendered client-side (SVG variations of the plant companion +
 * the world scene behind it); the server just needs each id's slot + how it
 * unlocks to validate an equip request.
 *
 *  - LEVEL-GATED cosmetics (`unlockLevel: number`) are deterministic — owned ⇔
 *    unlockLevel <= level, no per-user row.
 *  - EARNED cosmetics (`unlockLevel: null`) are seasonal / leaderboard rewards;
 *    owned ⇔ the id is present in the user's `user_unlocks` (Phase 3).
 *
 * The ReHabit + shared clients keep parallel catalogs with the render details —
 * keep the ids + unlock rules in sync. Cosmetics are GLORY-only (no power).
 */
export interface CosmeticDef {
  slot: string;
  /** Level at which it auto-unlocks; null = earned (must be in user_unlocks). */
  unlockLevel: number | null;
}

export const AVATAR_COSMETICS: Record<string, CosmeticDef> = {
  // pot (the Phase-1 colour picker becomes pot cosmetics)
  pot_sage: { slot: 'pot', unlockLevel: 1 },
  pot_coral: { slot: 'pot', unlockLevel: 1 },
  pot_sky: { slot: 'pot', unlockLevel: 2 },
  pot_lavender: { slot: 'pot', unlockLevel: 4 },
  pot_gold: { slot: 'pot', unlockLevel: 8 },
  pot_terracotta: { slot: 'pot', unlockLevel: 12 },
  // background scene behind the companion (flat tint)
  bg_plain: { slot: 'background', unlockLevel: 1 },
  bg_sky: { slot: 'background', unlockLevel: 5 },
  bg_sunset: { slot: 'background', unlockLevel: 9 },
  bg_meadow: { slot: 'background', unlockLevel: 14 },
  // small accessory add-on
  acc_none: { slot: 'accessory', unlockLevel: 1 },
  acc_butterfly: { slot: 'accessory', unlockLevel: 7 },
  acc_sun: { slot: 'accessory', unlockLevel: 12 },
  acc_lights: { slot: 'accessory', unlockLevel: 18 },

  // -- Phase 3 ---------------------------------------------------------------
  // world: a richer layered scene the companion lives in (level-gated tiers)
  world_meadow: { slot: 'world', unlockLevel: 1 },
  world_forest: { slot: 'world', unlockLevel: 6 },
  world_coast: { slot: 'world', unlockLevel: 12 },
  world_aurora: { slot: 'world', unlockLevel: 20 },

  // seasonal cosmetics — EARNED via season-points thresholds (see SEASON_REWARD_LADDER).
  // Meadow Bloom
  pot_wildflower: { slot: 'pot', unlockLevel: null },
  acc_fireflies: { slot: 'accessory', unlockLevel: null },
  world_meadow_bloom: { slot: 'world', unlockLevel: null },
  // Coastal Calm
  pot_seashell: { slot: 'pot', unlockLevel: null },
  acc_seabreeze: { slot: 'accessory', unlockLevel: null },
  world_coast_dusk: { slot: 'world', unlockLevel: null },
  // Summit Ascent
  pot_stone: { slot: 'pot', unlockLevel: null },
  acc_snowfall: { slot: 'accessory', unlockLevel: null },
  world_summit_peak: { slot: 'world', unlockLevel: null },
};

/**
 * Validate an equip map against a user's level + earned unlocks. Throws a
 * message on the first invalid/locked entry; returns the cleaned map on success.
 * A cosmetic is equippable iff it's level-unlocked OR present in `unlockedIds`.
 */
export function validateEquip(
  equipped: Record<string, unknown>,
  level: number,
  unlockedIds: ReadonlySet<string> = new Set(),
): { ok: true; equipped: Record<string, string> } | { ok: false; reason: string } {
  const cleaned: Record<string, string> = {};
  for (const [slot, id] of Object.entries(equipped)) {
    if (typeof id !== 'string') return { ok: false, reason: `Invalid cosmetic for slot "${slot}".` };
    const def = AVATAR_COSMETICS[id];
    if (!def) return { ok: false, reason: `Unknown cosmetic "${id}".` };
    if (def.slot !== slot) return { ok: false, reason: `Cosmetic "${id}" is not a ${slot}.` };
    const levelUnlocked = def.unlockLevel != null && def.unlockLevel <= level;
    if (!levelUnlocked && !unlockedIds.has(id)) {
      return {
        ok: false,
        reason:
          def.unlockLevel != null
            ? `Cosmetic "${id}" unlocks at level ${def.unlockLevel}.`
            : `Cosmetic "${id}" is a seasonal reward you haven't earned yet.`,
      };
    }
    cleaned[slot] = id;
  }
  return { ok: true, equipped: cleaned };
}
