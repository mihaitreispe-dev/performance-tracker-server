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
  Put,
  Query,
  Req,
  Version,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

import { NutritionApiService } from './nutrition-api.service';
import {
  BarcodeQuery,
  CreateCustomFoodBody,
  CreateFoodLogBody,
  DailySummaryQuery,
  FoodLogQuery,
  FoodSearchQuery,
  MonthlySummaryQuery,
  SetFavoriteBody,
  UpdateFoodLogBody,
  UpdateNutritionGoalsBody,
  WeeklySummaryQuery,
} from './request.dto';
import {
  DailyMealsResponseDTO,
  DailyNutritionSummaryDTO,
  FoodDTO,
  FoodListResponseDTO,
  FoodLogEntryDTO,
  FrequentFoodsResponseDTO,
  MonthlySummaryDTO,
  NutritionGoalsDTO,
  WeeklySummaryDTO,
} from './response.dto';

@ApiTags('Nutrition')
@ApiBearerAuth('JWT')
@Controller()
@SkipActiveOrg()
export class NutritionApiController {
  constructor(private readonly service: NutritionApiService) {}

  // ==========================================================================
  // Food Search
  // ==========================================================================

  @Version('1')
  @Get('nutrition/foods/search')
  @ApiOperation({ summary: 'Search foods database' })
  @ApiResponse({ status: 200, type: FoodListResponseDTO })
  async searchFoods(
    @Req() req: Request & { user: AuthUser },
    @Query() query: FoodSearchQuery,
  ): Promise<{ data: FoodListResponseDTO }> {
    return this.service.searchFoods(req, query);
  }

  @Version('1')
  @Get('nutrition/foods/barcode')
  @ApiOperation({ summary: 'Get food by barcode' })
  @ApiResponse({ status: 200, type: FoodDTO })
  async getFoodByBarcode(
    @Req() req: Request & { user: AuthUser },
    @Query() query: BarcodeQuery,
  ): Promise<{ data: FoodDTO | null }> {
    return this.service.getFoodByBarcode(req, query.barcode);
  }

  @Version('1')
  @Get('nutrition/foods/frequent')
  @ApiOperation({ summary: 'Get frequent and favorite foods' })
  @ApiResponse({ status: 200, type: FrequentFoodsResponseDTO })
  async getFrequentFoods(@Req() req: Request & { user: AuthUser }): Promise<{ data: FrequentFoodsResponseDTO }> {
    return this.service.getFrequentFoods(req);
  }

  @Version('1')
  @Get('nutrition/foods/:foodId')
  @ApiOperation({ summary: 'Get food by ID' })
  @ApiResponse({ status: 200, type: FoodDTO })
  async getFood(@Req() req: Request & { user: AuthUser }, @Param('foodId') foodId: string): Promise<{ data: FoodDTO }> {
    return this.service.getFood(req, foodId);
  }

  @Version('1')
  @Post('nutrition/foods/custom')
  @ApiOperation({ summary: 'Create custom food' })
  @ApiResponse({ status: 201, type: FoodDTO })
  async createCustomFood(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateCustomFoodBody,
  ): Promise<{ data: FoodDTO }> {
    return this.service.createCustomFood(req, body);
  }

  @Version('1')
  @Post('nutrition/foods/:foodId/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set food as favorite' })
  @ApiResponse({ status: 204, description: 'Favorite status updated' })
  async setFavorite(
    @Req() req: Request & { user: AuthUser },
    @Param('foodId') foodId: string,
    @Body() body: SetFavoriteBody,
  ): Promise<void> {
    return this.service.setFavorite(req, foodId, body.is_favorite);
  }

  // ==========================================================================
  // Food Logs
  // ==========================================================================

  @Version('1')
  @Get('nutrition/logs')
  @ApiOperation({ summary: 'List food logs for a date' })
  @ApiResponse({ status: 200, type: [FoodLogEntryDTO] })
  async listFoodLogs(
    @Req() req: Request & { user: AuthUser },
    @Query() query: FoodLogQuery,
  ): Promise<{ data: FoodLogEntryDTO[] }> {
    return this.service.listFoodLogs(req, query);
  }

  @Version('1')
  @Get('nutrition/logs/:logId')
  @ApiOperation({ summary: 'Get food log entry' })
  @ApiResponse({ status: 200, type: FoodLogEntryDTO })
  async getFoodLog(
    @Req() req: Request & { user: AuthUser },
    @Param('logId') logId: string,
  ): Promise<{ data: FoodLogEntryDTO }> {
    return this.service.getFoodLog(req, logId);
  }

  @Version('1')
  @Post('nutrition/logs')
  @ApiOperation({ summary: 'Create food log entry' })
  @ApiResponse({ status: 201, type: FoodLogEntryDTO })
  async createFoodLog(
    @Req() req: Request & { user: AuthUser },
    @Body() body: CreateFoodLogBody,
  ): Promise<{ data: FoodLogEntryDTO }> {
    return this.service.createFoodLog(req, body);
  }

  @Version('1')
  @Patch('nutrition/logs/:logId')
  @ApiOperation({ summary: 'Update food log entry' })
  @ApiResponse({ status: 200, type: FoodLogEntryDTO })
  async updateFoodLog(
    @Req() req: Request & { user: AuthUser },
    @Param('logId') logId: string,
    @Body() body: UpdateFoodLogBody,
  ): Promise<{ data: FoodLogEntryDTO }> {
    return this.service.updateFoodLog(req, logId, body);
  }

  @Version('1')
  @Delete('nutrition/logs/:logId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete food log entry' })
  @ApiResponse({ status: 204, description: 'Entry deleted' })
  async deleteFoodLog(@Req() req: Request & { user: AuthUser }, @Param('logId') logId: string): Promise<void> {
    return this.service.deleteFoodLog(req, logId);
  }

  // ==========================================================================
  // Summaries
  // ==========================================================================

  @Version('1')
  @Get('nutrition/summary/daily')
  @ApiOperation({ summary: 'Get daily nutrition summary' })
  @ApiResponse({ status: 200, type: DailyNutritionSummaryDTO })
  async getDailySummary(
    @Req() req: Request & { user: AuthUser },
    @Query() query: DailySummaryQuery,
  ): Promise<{ data: DailyNutritionSummaryDTO | null }> {
    return this.service.getDailySummary(req, query.date);
  }

  @Version('1')
  @Get('nutrition/summary/daily/:date/meals')
  @ApiOperation({ summary: 'Get daily meals breakdown with goal progress' })
  @ApiResponse({ status: 200, type: DailyMealsResponseDTO })
  async getDailyMeals(
    @Req() req: Request & { user: AuthUser },
    @Param('date') date: string,
  ): Promise<{ data: DailyMealsResponseDTO }> {
    return this.service.getDailyMeals(req, date);
  }

  @Version('1')
  @Get('nutrition/summary/weekly')
  @ApiOperation({ summary: 'Get weekly nutrition summary' })
  @ApiResponse({ status: 200, type: WeeklySummaryDTO })
  async getWeeklySummary(
    @Req() req: Request & { user: AuthUser },
    @Query() query: WeeklySummaryQuery,
  ): Promise<{ data: WeeklySummaryDTO }> {
    return this.service.getWeeklySummary(req, query);
  }

  @Version('1')
  @Get('nutrition/summary/monthly')
  @ApiOperation({ summary: 'Get monthly nutrition summary' })
  @ApiResponse({ status: 200, type: MonthlySummaryDTO })
  async getMonthlySummary(
    @Req() req: Request & { user: AuthUser },
    @Query() query: MonthlySummaryQuery,
  ): Promise<{ data: MonthlySummaryDTO }> {
    return this.service.getMonthlySummary(req, query);
  }

  // ==========================================================================
  // Goals
  // ==========================================================================

  @Version('1')
  @Get('nutrition/goals')
  @ApiOperation({ summary: 'Get nutrition goals' })
  @ApiResponse({ status: 200, type: NutritionGoalsDTO })
  async getNutritionGoals(@Req() req: Request & { user: AuthUser }): Promise<{ data: NutritionGoalsDTO | null }> {
    return this.service.getNutritionGoals(req);
  }

  @Version('1')
  @Put('nutrition/goals')
  @ApiOperation({ summary: 'Update nutrition goals' })
  @ApiResponse({ status: 200, type: NutritionGoalsDTO })
  async updateNutritionGoals(
    @Req() req: Request & { user: AuthUser },
    @Body() body: UpdateNutritionGoalsBody,
  ): Promise<{ data: NutritionGoalsDTO }> {
    return this.service.updateNutritionGoals(req, body);
  }
}
