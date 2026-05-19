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
  UploadedFile,
  UseInterceptors,
  Version,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

import { RaceCalendarApiService } from './race-calendar-api.service';
import {
  CreateAthleteRaceBody,
  GeneratePeriodizationQuery,
  SearchRacesQuery,
  UpdateAthleteRaceBody,
  UpdatePeriodizationBody,
  UploadCourseBody,
} from './request.dto';
import {
  AthleteRaceDTO,
  CourseBasedPredictionDTO,
  CourseUploadResponseDTO,
  PeriodizationPlanDTO,
  RaceEventDTO,
} from './response.dto';

@ApiTags('Race Calendar')
@ApiBearerAuth('JWT')
@Controller()
@SkipActiveOrg()
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
  // Course File Management
  // ==========================================================================

  @Version('1')
  @Post('users/:userId/races/:raceId/course')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload course file (GPX/FIT) for a race' })
  @ApiResponse({ status: 201, type: CourseUploadResponseDTO })
  async uploadCourseFile(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadCourseBody,
  ): Promise<CourseUploadResponseDTO> {
    return this.service.uploadCourseFile(req, raceId, file, body);
  }

  @Version('1')
  @Get('users/:userId/races/:raceId/course-prediction')
  @ApiOperation({ summary: 'Get course-based prediction for a race' })
  @ApiResponse({ status: 200, type: CourseBasedPredictionDTO })
  async getCoursePrediction(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
  ): Promise<CourseBasedPredictionDTO> {
    return this.service.getCoursePrediction(req, raceId);
  }

  @Version('1')
  @Delete('users/:userId/races/:raceId/course')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete course file from a race' })
  @ApiResponse({ status: 204 })
  async deleteCourseFile(
    @Req() req: Request & { user: AuthUser },
    @Param('userId') _userId: string,
    @Param('raceId') raceId: string,
  ): Promise<void> {
    return this.service.deleteCourseFile(req, raceId);
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
