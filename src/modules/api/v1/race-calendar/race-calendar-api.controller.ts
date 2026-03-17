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
import { Request } from 'express';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';

import { RaceCalendarApiService } from './race-calendar-api.service';
import {
  CreateAthleteRaceBody,
  GeneratePeriodizationQuery,
  SearchRacesQuery,
  UpdateAthleteRaceBody,
  UpdatePeriodizationBody,
} from './request.dto';
import { AthleteRaceDTO, PeriodizationPlanDTO, RaceEventDTO } from './response.dto';

@ApiTags('Race Calendar')
@ApiBearerAuth('JWT')
@Controller()
export class RaceCalendarApiController {
  constructor(private readonly service: RaceCalendarApiService) {}

  // ==========================================================================
  // Race Event Search
  // ==========================================================================

  @Version('1')
  @Get('races/search')
  @ApiOperation({ summary: 'Search for race events' })
  @ApiResponse({ status: 200, type: [RaceEventDTO] })
  async searchRaces(@Query() query: SearchRacesQuery): Promise<RaceEventDTO[]> {
    return this.service.searchRaces(query);
  }

  @Version('1')
  @Get('races/:externalId')
  @ApiOperation({ summary: 'Get race event details' })
  @ApiResponse({ status: 200, type: RaceEventDTO })
  async getRaceDetails(
    @Param('externalId') externalId: string,
    @Query('source') source: string,
  ): Promise<RaceEventDTO> {
    return this.service.getRaceDetails(externalId, source);
  }

  // ==========================================================================
  // Athlete Races
  // ==========================================================================

  @Version('1')
  @Get('users/:userId/races')
  @ApiOperation({ summary: 'List athlete races' })
  @ApiResponse({ status: 200, type: [AthleteRaceDTO] })
  async listAthleteRaces(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
  ): Promise<AthleteRaceDTO[]> {
    // Note: userId param is for API consistency, actual user comes from JWT
    return this.service.listAthleteRaces(req);
  }

  @Version('1')
  @Get('users/:userId/races/:raceId')
  @ApiOperation({ summary: 'Get athlete race details' })
  @ApiResponse({ status: 200, type: AthleteRaceDTO })
  async getAthleteRace(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
  ): Promise<AthleteRaceDTO> {
    return this.service.getAthleteRace(req, raceId);
  }

  @Version('1')
  @Post('users/:userId/races')
  @ApiOperation({ summary: 'Create athlete race' })
  @ApiResponse({ status: 201, type: AthleteRaceDTO })
  async createAthleteRace(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Body() body: CreateAthleteRaceBody,
  ): Promise<AthleteRaceDTO> {
    return this.service.createAthleteRace(req, body);
  }

  @Version('1')
  @Patch('users/:userId/races/:raceId')
  @ApiOperation({ summary: 'Update athlete race' })
  @ApiResponse({ status: 200, type: AthleteRaceDTO })
  async updateAthleteRace(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
    @Body() body: UpdateAthleteRaceBody,
  ): Promise<AthleteRaceDTO> {
    return this.service.updateAthleteRace(req, raceId, body);
  }

  @Version('1')
  @Delete('users/:userId/races/:raceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete athlete race' })
  @ApiResponse({ status: 204 })
  async deleteAthleteRace(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
  ): Promise<void> {
    return this.service.deleteAthleteRace(req, raceId);
  }

  // ==========================================================================
  // Periodization
  // ==========================================================================

  @Version('1')
  @Get('users/:userId/races/:raceId/periodization')
  @ApiOperation({ summary: 'Get or generate periodization plan' })
  @ApiResponse({ status: 200, type: PeriodizationPlanDTO })
  async getPeriodization(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
    @Query() query: GeneratePeriodizationQuery,
  ): Promise<PeriodizationPlanDTO> {
    return this.service.getPeriodization(req, raceId, query);
  }

  @Version('1')
  @Patch('users/:userId/races/:raceId/periodization')
  @ApiOperation({ summary: 'Update periodization plan' })
  @ApiResponse({ status: 200, type: PeriodizationPlanDTO })
  async updatePeriodization(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
    @Body() body: UpdatePeriodizationBody,
  ): Promise<PeriodizationPlanDTO> {
    return this.service.updatePeriodization(req, raceId, body);
  }
}
