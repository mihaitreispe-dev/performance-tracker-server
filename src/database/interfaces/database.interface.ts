import { RefreshTokensTable } from './refresh-tokens-table.interface';
import { UsersTable } from './users-table.interface';

export interface Database {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
}
