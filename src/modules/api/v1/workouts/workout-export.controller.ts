import { Controller, Get, HttpStatus, NotFoundException, Param, Req, Res, Version } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { ErrorResponse } from 'src/lib/http/dto/error-response.dto';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';
import { CardioStepRepository } from 'src/repositories/cardio-step.repository';
import { CardioStepGroupRepository } from 'src/repositories/cardio-step-group.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';

import { FitGeneratorService } from './fit-generator.service';
import { WorkoutIdParam } from './request.dto';

@ApiTags('workouts')
@ApiBearerAuth('JWT')
@Controller('workouts')
@SkipActiveOrg()
export class WorkoutExportController {
  constructor(
    private readonly workoutRepo: WorkoutRepository,
    private readonly cardioStepRepo: CardioStepRepository,
    private readonly cardioStepGroupRepo: CardioStepGroupRepository,
    private readonly fitGenerator: FitGeneratorService,
  ) {}

  @Version('1')
  @ApiOperation({ summary: 'Export workout to FIT format' })
  @ApiProduces('application/octet-stream')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'FIT file download',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: ErrorResponse, description: 'Unauthorized' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponse, description: 'Workout not found' })
  @Get(':id/export/fit')
  async exportToFit(
    @Req() req: Request & { user: AuthUser },
    @Res() res: Response,
    @Param() params: WorkoutIdParam,
  ): Promise<void> {
    // Fetch workout
    const workout = await this.workoutRepo.findById(params.id);
    if (!workout || workout.user_id !== req.user.id) {
      throw new NotFoundException('Workout not found');
    }

    // Fetch workout items
    const workoutItems = await this.workoutRepo.findWorkoutItemsByWorkoutId(params.id);

    // Collect cardio step IDs and group IDs
    const cardioStepIds: string[] = [];
    const cardioStepGroupIds: string[] = [];

    for (const item of workoutItems) {
      if (item.cardio_step_id) {
        cardioStepIds.push(item.cardio_step_id);
      }
      if (item.cardio_step_group_id) {
        cardioStepGroupIds.push(item.cardio_step_group_id);
      }
    }

    // Fetch cardio steps
    const cardioSteps = await this.cardioStepRepo.findByIds([...new Set(cardioStepIds)]);

    // Fetch cardio step groups and their items
    type GroupWithItems = {
      group: Awaited<ReturnType<typeof this.cardioStepGroupRepo.findById>>;
      items: typeof cardioSteps;
    };
    const cardioStepGroups: GroupWithItems[] = [];

    if (cardioStepGroupIds.length > 0) {
      for (const groupId of cardioStepGroupIds) {
        const group = await this.cardioStepGroupRepo.findById(groupId);
        if (group) {
          const groupItems = await this.cardioStepGroupRepo.findGroupItemsByGroupIds([groupId]);
          const groupStepIds = groupItems.map((gi) => gi.cardio_step_id);
          const groupSteps = await this.cardioStepRepo.findByIds(groupStepIds);

          // Sort by position
          const sortedSteps = groupItems
            .sort((a, b) => a.position - b.position)
            .map((gi) => groupSteps.find((s) => s.id === gi.cardio_step_id))
            .filter((s): s is NonNullable<typeof s> => s != null);

          cardioStepGroups.push({ group, items: sortedSteps });
        }
      }
    }

    // Generate FIT file
    const fitBuffer = this.fitGenerator.generateWorkoutFit(
      workout,
      cardioSteps,
      cardioStepGroups,
      workoutItems.map((wi) => ({
        cardio_step_id: wi.cardio_step_id,
        cardio_step_group_id: wi.cardio_step_group_id,
        position: wi.position,
      })),
    );

    // Sanitize filename
    const filename = workout.name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 50);

    // Send response
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}.fit"`,
      'Content-Length': fitBuffer.length,
    });
    res.send(fitBuffer);
  }
}
