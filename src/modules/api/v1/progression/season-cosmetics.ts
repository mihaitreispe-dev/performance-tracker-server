/**
 * Seasonal reward ladder — which cosmetics a season's theme grants, and at what
 * season-points threshold. Season points are DERIVED (XP-ledger sum over the
 * season window); when a user's total crosses a threshold, award() grants the
 * cosmetic into user_unlocks (idempotent). getSeason() renders the ladder with
 * earned/next flags. Lifetime xp/level are never touched.
 *
 * Keyed by season.theme. Cosmetic ids MUST exist in AVATAR_COSMETICS with
 * unlockLevel: null (earned, not level-gated).
 */
export interface SeasonReward {
  cosmeticId: string;
  pointsThreshold: number;
}

export const SEASON_REWARD_LADDER: Record<string, SeasonReward[]> = {
  meadow: [
    { cosmeticId: 'pot_wildflower', pointsThreshold: 100 },
    { cosmeticId: 'acc_fireflies', pointsThreshold: 300 },
    { cosmeticId: 'world_meadow_bloom', pointsThreshold: 600 },
  ],
  coast: [
    { cosmeticId: 'pot_seashell', pointsThreshold: 100 },
    { cosmeticId: 'acc_seabreeze', pointsThreshold: 300 },
    { cosmeticId: 'world_coast_dusk', pointsThreshold: 600 },
  ],
  summit: [
    { cosmeticId: 'pot_stone', pointsThreshold: 100 },
    { cosmeticId: 'acc_snowfall', pointsThreshold: 300 },
    { cosmeticId: 'world_summit_peak', pointsThreshold: 600 },
  ],
};

/** The reward ladder for a season theme (empty if the theme has none). */
export function ladderForTheme(theme: string): SeasonReward[] {
  return SEASON_REWARD_LADDER[theme] ?? [];
}
