import { Controller, Get } from '@nestjs/common';

@Controller()
export class IndexApiController {
  constructor() {}

  @Get()
  getIndex() {
    return '200';
  }
}
