import { RefreshTokensTable } from './refresh-tokens-table.interface.js';
import { UsersTable } from './users-table.interface.js';

export interface Database {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
}
