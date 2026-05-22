import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export type ThemeTokens = Record<string, string>;
export type CopyOverrides = Record<string, string>;

export interface OrganisationThemesTable {
  organisation_id: string;
  /**
   * Light-mode token set. Named `theme_tokens` rather than
   * `theme_tokens_light` for back-compat — existing readers assume this is
   * the canonical set. The dark variant sits beside it.
   */
  theme_tokens: ColumnType<ThemeTokens, ThemeTokens | undefined, ThemeTokens>;
  /** Dark-mode token set. Empty `{}` falls back to MUI's stock dark palette. */
  theme_tokens_dark: ColumnType<ThemeTokens, ThemeTokens | undefined, ThemeTokens>;
  copy_overrides: ColumnType<CopyOverrides, CopyOverrides | undefined, CopyOverrides>;
  font_family: string | null;
  favicon_s3_bucket: string | null;
  favicon_s3_key: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type OrganisationTheme = Selectable<OrganisationThemesTable>;
export type NewOrganisationTheme = Insertable<OrganisationThemesTable>;
export type OrganisationThemeUpdate = Updateable<OrganisationThemesTable>;
