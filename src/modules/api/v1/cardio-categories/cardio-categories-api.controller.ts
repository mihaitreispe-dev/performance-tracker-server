import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

import { CardioCategoriesApiService } from './cardio-categories-api.service';
import { CardioCategoryIdParam, CreateCardioCategoryBody, ListCardioCategoriesQuery } from './request.dto';
import { CardioCategoryListResponse, CardioCategoryResponse } from './response.dto';

@ApiTags('cardio-categories')
@ApiBearerAuth('JWT')
@Controller('cardio-categories')
@SkipActiveOrg()
export class CardioCategoriesApiController {
  constructor(private readonly service: CardioCategoriesApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List cardio categories' })
  @ApiResponse({ status: HttpStatus.OK, type: CardioCategoryListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(
    @Req() req: Request & { user: AuthUser },
    @Query() query: ListCardioCategoriesQuery,
  ): Promise<CardioCategoryListResponse> {
    return this.service.list(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Create custom cardio category' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CardioCategoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post()
  async create(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateCardioCategoryBody,
  ): Promise<CardioCategoryResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete custom cardio category' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ErrorResponse, description: 'Cannot delete system categories' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Req() req: Request & { user: AuthUser }, @Param() params: CardioCategoryIdParam): Promise<void> {
    return this.service.delete(req, params.id);
  }
}
