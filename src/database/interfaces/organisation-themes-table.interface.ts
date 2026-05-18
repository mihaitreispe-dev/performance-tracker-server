import { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export type ThemeTokens = Record<string, string>;
export type CopyOverrides = Record<string, string>;

export interface OrganisationThemesTable {
  organisation_id: string;
  theme_tokens: ColumnType<ThemeTokens, ThemeTokens | undefined, ThemeTokens>;
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
