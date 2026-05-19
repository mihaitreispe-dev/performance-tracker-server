import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import type { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';

import { CoursesApiService } from './courses-api.service';
import {
  AddLessonDto,
  CourseIdParam,
  CourseLessonIdParams,
  CreateCourseDto,
  ListCoursesQuery,
  ReorderLessonsDto,
  UpdateCourseDto,
} from './request.dto';
import {
  CourseLessonResponse,
  CourseProgressResponse,
  CourseResponse,
  CourseWithLessonsResponse,
  CoursesListResponse,
} from './response.dto';

@ApiTags('Courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('courses')
export class CoursesApiController {
  constructor(private readonly coursesService: CoursesApiService) {}

  @Get()
  @ApiOperation({ summary: 'List courses in the active organisation' })
  @ApiOkResponse({ type: CoursesListResponse })
  async list(@Req() req: AuthedRequest, @Query() query: ListCoursesQuery): Promise<CoursesListResponse> {
    return this.coursesService.list(req, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a course with its ordered lessons' })
  @ApiOkResponse({ type: CourseWithLessonsResponse })
  async getById(
    @Req() req: AuthedRequest,
    @Param() params: CourseIdParam,
  ): Promise<CourseWithLessonsResponse> {
    return this.coursesService.getById(req, params.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a course (coach/admin/owner)' })
  @ApiOkResponse({ type: CourseResponse })
  async create(@Req() req: AuthedRequest, @Body() dto: CreateCourseDto): Promise<CourseResponse> {
    return this.coursesService.create(req, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update course metadata or status (coach/admin/owner)' })
  @ApiOkResponse({ type: CourseResponse })
  async update(
    @Req() req: AuthedRequest,
    @Param() params: CourseIdParam,
    @Body() dto: UpdateCourseDto,
  ): Promise<CourseResponse> {
    return this.coursesService.update(req, params.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a course (coach/admin/owner)' })
  @ApiNoContentResponse()
  async delete(@Req() req: AuthedRequest, @Param() params: CourseIdParam): Promise<void> {
    return this.coursesService.delete(req, params.id);
  }

  // ---- lessons ----

  @Post(':id/lessons')
  @ApiOperation({ summary: 'Append a content item as a lesson at the end of the course' })
  @ApiOkResponse({ type: CourseLessonResponse })
  async addLesson(
    @Req() req: AuthedRequest,
    @Param() params: CourseIdParam,
    @Body() dto: AddLessonDto,
  ): Promise<CourseLessonResponse> {
    return this.coursesService.addLesson(req, params.id, dto);
  }

  @Patch(':id/lessons/reorder')
  @ApiOperation({ summary: 'Reorder all lessons. Body must list every existing lesson id in the new order.' })
  @ApiNoContentResponse()
  async reorderLessons(
    @Req() req: AuthedRequest,
    @Param() params: CourseIdParam,
    @Body() dto: ReorderLessonsDto,
  ): Promise<void> {
    return this.coursesService.reorderLessons(req, params.id, dto);
  }

  @Delete(':id/lessons/:lessonId')
  @ApiOperation({ summary: 'Remove a lesson from a course (does not delete the content item)' })
  @ApiNoContentResponse()
  async removeLesson(
    @Req() req: AuthedRequest,
    @Param() params: CourseLessonIdParams,
  ): Promise<void> {
    return this.coursesService.removeLesson(req, params.id, params.lessonId);
  }

  // ---- completion ----

  @Post(':id/lessons/:lessonId/complete')
  @ApiOperation({ summary: 'Mark a lesson complete for the current user (idempotent)' })
  @ApiNoContentResponse()
  async markLessonComplete(
    @Req() req: AuthedRequest,
    @Param() params: CourseLessonIdParams,
  ): Promise<void> {
    return this.coursesService.markLessonComplete(req, params.id, params.lessonId);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Get the current user’s progress through this course' })
  @ApiOkResponse({ type: CourseProgressResponse })
  async getProgress(
    @Req() req: AuthedRequest,
    @Param() params: CourseIdParam,
  ): Promise<CourseProgressResponse> {
    return this.coursesService.getProgress(req, params.id);
  }
}
