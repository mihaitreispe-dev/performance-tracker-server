import { Controller, Get, HttpStatus, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';

import { CategoriesApiService } from './categories-api.service';
import { CategoryListResponse } from './response.dto';

@ApiTags('categories')
@ApiBearerAuth('JWT')
@Controller('categories')
export class CategoriesApiController {
  constructor(private readonly service: CategoriesApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List all exercise categories (shared reference data)' })
  @ApiResponse({ status: HttpStatus.OK, type: CategoryListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(): Promise<CategoryListResponse> {
    return this.service.list();
  }
}
