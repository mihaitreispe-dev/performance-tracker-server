import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresDialect } from 'kysely';
import { KyselyModule } from 'nestjs-kysely';
import { Pool } from 'pg';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { AppConfigService } from 'src/modules/config/app-config.service';

@Module({})
export class DatabaseModule {
  private static rootInstance?: DynamicModule;
  static forRoot(): DynamicModule {
    if (!this.rootInstance) {
      this.rootInstance = {
        module: DatabaseModule,
        imports: [
          ConfigModule,
          KyselyModule.forRootAsync({
            imports: [AppConfigModule.register()],
            inject: [AppConfigService],
            useFactory: async function (configService: AppConfigService) {
              return {
                dialect: new PostgresDialect({
                  pool: new Pool({
                    host: configService.dbHost,
                    port: configService.dbPort,
                    user: configService.dbUser,
                    password: configService.dbPassword,
                    database: configService.dbName,
                    ssl: configService.dbSSL ? { rejectUnauthorized: false } : false,
                    max: 10,
                  }),
                }),
              };
            },
          }),
        ],
      };
    }
    return this.rootInstance;
  }
}
