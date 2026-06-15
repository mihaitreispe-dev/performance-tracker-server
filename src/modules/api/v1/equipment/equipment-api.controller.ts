import { Body, Controller, Get, HttpStatus, Post, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';

import { EquipmentApiService } from './equipment-api.service';
import { CreateEquipmentBody } from './request.dto';
import { EquipmentDTO, EquipmentListResponse } from './response.dto';

@ApiTags('equipment')
@ApiBearerAuth('JWT')
@Controller('equipment')
export class EquipmentApiController {
  constructor(private readonly service: EquipmentApiService) {}

  @Version('1')
  @ApiOperation({ summary: 'List all equipment (shared reference data)' })
  @ApiResponse({ status: HttpStatus.OK, type: EquipmentListResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get()
  async list(): Promise<EquipmentListResponse> {
    return this.service.list();
  }

  @Version('1')
  @ApiOperation({ summary: 'Create equipment (idempotent by name)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: EquipmentDTO })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post()
  async create(@Body() body: CreateEquipmentBody): Promise<EquipmentDTO> {
    return this.service.create(body);
  }
}
