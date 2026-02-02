import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import { DiskHealthIndicator, HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';

@Controller('health')
@ApiBearerAuth('JWT')
@ApiExcludeController()
export class HealthApiController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private disk: DiskHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => this.http.pingCheck('http', 'https://google.com'),
      // The used disk storage should not exceed 75% of the full disk size
      async () =>
        this.disk.checkStorage('disk_usage_percent', {
          thresholdPercent: 0.75,
          path: '/',
        }),
    ]);
  }
}
