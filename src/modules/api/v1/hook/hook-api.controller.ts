import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

@ApiTags('hook')
@ApiBearerAuth('JWT')
@Controller('hook')
@SkipActiveOrg()
export class HookApiController {
  constructor() {}

  @ApiResponse({
    status: 200,
  })
  @Post('no-op')
  async noOpHook(): Promise<any> {
    return;
  }
}
