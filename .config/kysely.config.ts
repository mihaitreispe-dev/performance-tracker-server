import 'dotenv/config';

import * as path from 'node:path';

import { PostgresDialect } from 'kysely';
import { defineConfig } from 'kysely-ctl';
import { Pool } from 'pg';

const projectRoot = path.resolve(__dirname, '..');

export default defineConfig({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number.parseInt(process.env.DB_PORT, 10) : undefined,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      ssl: process.env.DB_SSL === 'Y' ? { rejectUnauthorized: false } : false,
      max: 10,
    }),
  }),
  migrations: {
    migrationFolder: path.join(projectRoot, 'src/database/migrations'),
    allowUnorderedMigrations: true,
  },
  plugins: [],
  seeds: {
    seedFolder: path.join(projectRoot, 'src/database/seeds'),
  },
});
