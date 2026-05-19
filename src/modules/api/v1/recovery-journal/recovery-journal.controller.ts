import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

import { RecoveryJournalService } from './recovery-journal.service';
import {
  CreateRecoveryJournalEntryBody,
  RecoveryJournalCorrelationQuery,
  RecoveryJournalDateParam,
  RecoveryJournalHistoryQuery,
  RecoveryJournalIdParam,
  UpdateRecoveryJournalEntryBody,
} from './request.dto';
import { RecoveryCorrelationsResponse, RecoveryHistoryResponse, RecoveryJournalEntryResponse } from './response.dto';

@ApiTags('recovery-journal')
@ApiBearerAuth('JWT')
@Controller('recovery-journal')
@SkipActiveOrg()
export class RecoveryJournalController {
  constructor(private readonly service: RecoveryJournalService) {}

  @Version('1')
  @ApiOperation({ summary: "Get today's recovery journal entry" })
  @ApiResponse({ status: HttpStatus.OK, type: RecoveryJournalEntryResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No entry found for today' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('today')
  async getToday(@Req() req: Request & { user: AuthUser }): Promise<RecoveryJournalEntryResponse> {
    return this.service.getToday(req);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get recovery journal entry for a specific date' })
  @ApiResponse({ status: HttpStatus.OK, type: RecoveryJournalEntryResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'No entry found for date' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get(':date')
  async getByDate(
    @Req() req: Request & { user: AuthUser },
    @Param() params: RecoveryJournalDateParam,
  ): Promise<RecoveryJournalEntryResponse> {
    return this.service.getByDate(req, params.date);
  }

  @Version('1')
  @ApiOperation({ summary: 'Create or update a recovery journal entry' })
  @ApiResponse({ status: HttpStatus.CREATED, type: RecoveryJournalEntryResponse })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Invalid input' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Post()
  async create(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateRecoveryJournalEntryBody,
  ): Promise<RecoveryJournalEntryResponse> {
    return this.service.create(req, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Update a recovery journal entry' })
  @ApiResponse({ status: HttpStatus.OK, type: RecoveryJournalEntryResponse })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Entry not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponse, description: 'Invalid input' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Patch(':id')
  async update(
    @Req() req: Request & { user: AuthUser },
    @Param() params: RecoveryJournalIdParam,
    @Body() body: UpdateRecoveryJournalEntryBody,
  ): Promise<RecoveryJournalEntryResponse> {
    return this.service.update(req, params.id, body);
  }

  @Version('1')
  @ApiOperation({ summary: 'Delete a recovery journal entry' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Entry not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async delete(@Req() req: Request & { user: AuthUser }, @Param() params: RecoveryJournalIdParam): Promise<void> {
    return this.service.delete(req, params.id);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get recovery journal history with averages' })
  @ApiResponse({ status: HttpStatus.OK, type: RecoveryHistoryResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('history/summary')
  async getHistory(
    @Req() req: Request & { user: AuthUser },
    @Query() query: RecoveryJournalHistoryQuery,
  ): Promise<RecoveryHistoryResponse> {
    return this.service.getHistory(req, query);
  }

  @Version('1')
  @ApiOperation({ summary: 'Get correlations between journal factors and HRV' })
  @ApiResponse({ status: HttpStatus.OK, type: RecoveryCorrelationsResponse })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @Get('correlations')
  async getCorrelations(
    @Req() req: Request & { user: AuthUser },
    @Query() query: RecoveryJournalCorrelationQuery,
  ): Promise<RecoveryCorrelationsResponse> {
    return this.service.getCorrelations(req, query);
  }
}
