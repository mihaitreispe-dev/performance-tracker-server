import { Controller, Get } from '@nestjs/common';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

@Controller()
@SkipActiveOrg()
export class IndexApiController {
  constructor() {}

  @Get()
  getIndex() {
    return '200';
  }
}
