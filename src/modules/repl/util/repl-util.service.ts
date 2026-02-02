import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ReplUtilService {
  private readonly logger = new Logger(ReplUtilService.name);
  constructor() {}

  async hello() {
    this.logger.log('hello');
  }
}
