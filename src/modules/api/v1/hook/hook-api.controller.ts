import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('hook')
@ApiBearerAuth('JWT')
@Controller('hook')
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
