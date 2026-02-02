import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BoostrapEnv } from 'src/env';

@Injectable()
export class BootstrapConfigService {
  constructor(private readonly configService: ConfigService<BoostrapEnv>) {}

  get apiV1ModuleEnabled(): boolean {
    return this.configService.get('API_V1_MODULE_ENABLED') === 'Y';
  }

  get apiV1Port(): number {
    return this.configService.get('API_V1_PORT') ?? 3000;
  }

  get cronModuleEnabled(): boolean {
    return this.configService.get('CRON_MODULE_ENABLED') === 'Y';
  }
}
