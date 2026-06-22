import { Controller, Get, HttpStatus, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';

import { MovementPatternsApiService } from './movement-patterns-api.service';
import { MovementPatternListResponse } from './response.dto';

@ApiTags('movement-patterns')
@ApiBearerAuth('JWT')
@Controller('movement-patterns')
export class MovementPatternsApiController {
  constructor(private readonly service: MovementPatternsApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List all movement patterns (shared reference data)' })
  @ApiResponse({ status: HttpStatus.OK, type: MovementPatternListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(): Promise<MovementPatternListResponse> {
    return this.service.list();
  }
}
