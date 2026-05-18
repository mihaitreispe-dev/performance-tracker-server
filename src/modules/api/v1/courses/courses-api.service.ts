import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentItemKind, Course, CourseStatus, OrganisationRole } from 'src/database/interfaces';
import { assertActiveOrg } from 'src/lib/util/active-org';
import type { AuthedRequest } from 'src/modules/auth/types/request-with-active-org';
import { S3Service } from 'src/modules/s3/s3.service';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';

import { ContentItemsApiService } from '../content-items/content-items-api.service';
import {
  AddLessonDto,
  CreateCourseDto,
  ListCoursesQuery,
  ReorderLessonsDto,
  UpdateCourseDto,
} from './request.dto';
import {
  CourseDTO,
  CourseLessonDTO,
  CourseLessonResponse,
  CourseProgressResponse,
  CourseResponse,
  CourseWithLessonsDTO,
  CourseWithLessonsResponse,
  CoursesListResponse,
} from './response.dto';

const WRITE_ROLES: OrganisationRole[] = [
  OrganisationRole.OWNER,
  OrganisationRole.ADMIN,
  OrganisationRole.COACH,
];

@Injectable()
export class CoursesApiService {
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly contentRepo: ContentItemRepository,
    private readonly contentItemsService: ContentItemsApiService,
    private readonly s3Service: S3Service,
  ) {}

  async list(req: AuthedRequest, query: ListCoursesQuery): Promise<CoursesListResponse> {
    const organisationId = assertActiveOrg(req);
    const courses = await this.courseRepo.list(
      organisationId,
      { status: query.status },
      { limit: query.limit, offset: query.offset },
    );
    const data = await Promise.all(
      courses.map(async (c) => this.mapToDTO(c, (await this.courseRepo.listLessons(c.id)).length)),
    );
    return { data };
  }

  async getById(req: AuthedRequest, id: string): Promise<CourseWithLessonsResponse> {
    const organisationId = assertActiveOrg(req);
    const course = await this.courseRepo.findById(id, organisationId);
    if (!course) throw new NotFoundException('Course not found');
    const lessons = await this.courseRepo.listLessons(id);
    const contentItems = await this.contentRepo.findByIds(lessons.map((l) => l.content_item_id));
    const itemsById = new Map(contentItems.map((i) => [i.id, i]));

    const lessonDTOs: CourseLessonDTO[] = await Promise.all(
      lessons.map(async (l) => {
        const item = itemsById.get(l.content_item_id);
        if (!item) {
          throw new NotFoundException(`Lesson ${l.id} references missing content item ${l.content_item_id}`);
        }
        return {
          id: l.id,
          courseId: l.course_id,
          sortOrder: l.sort_order,
          contentItem: await this.contentItemsService.mapToDTO(item),
        };
      }),
    );

    const withLessons: CourseWithLessonsDTO = {
      ...(await this.mapToDTO(course, lessons.length)),
      lessons: lessonDTOs,
    };
    return { data: withLessons };
  }

  async create(req: AuthedRequest, dto: CreateCourseDto): Promise<CourseResponse> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const course = await this.courseRepo.create({
      organisation_id: organisationId,
      title: dto.title,
      description: dto.description ?? null,
      owner_user_id: req.user.id,
      status: CourseStatus.DRAFT,
    });
    return { data: await this.mapToDTO(course, 0) };
  }

  async update(req: AuthedRequest, id: string, dto: UpdateCourseDto): Promise<CourseResponse> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const existing = await this.courseRepo.findById(id, organisationId);
    if (!existing) throw new NotFoundException('Course not found');
    const updated = await this.courseRepo.updateById(id, {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    const lessonCount = (await this.courseRepo.listLessons(id)).length;
    return { data: await this.mapToDTO(updated, lessonCount) };
  }

  async delete(req: AuthedRequest, id: string): Promise<void> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const existing = await this.courseRepo.findById(id, organisationId);
    if (!existing) throw new NotFoundException('Course not found');
    await this.courseRepo.deleteById(id);
  }

  // ---- lessons ----

  async addLesson(req: AuthedRequest, courseId: string, dto: AddLessonDto): Promise<CourseLessonResponse> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);

    const course = await this.courseRepo.findById(courseId, organisationId);
    if (!course) throw new NotFoundException('Course not found');

    const contentItem = await this.contentRepo.findByIdInOrg(dto.contentItemId, organisationId);
    if (!contentItem) throw new NotFoundException('Content item not found in this organisation');
    if (contentItem.kind !== ContentItemKind.COURSE_LESSON) {
      throw new BadRequestException(`Content item must be of kind ${ContentItemKind.COURSE_LESSON}`);
    }

    const sortOrder = await this.courseRepo.nextSortOrder(courseId);
    const lesson = await this.courseRepo.addLesson({
      course_id: courseId,
      content_item_id: dto.contentItemId,
      sort_order: sortOrder,
    });
    return {
      data: {
        id: lesson.id,
        courseId: lesson.course_id,
        sortOrder: lesson.sort_order,
        contentItem: await this.contentItemsService.mapToDTO(contentItem),
      },
    };
  }

  async reorderLessons(req: AuthedRequest, courseId: string, dto: ReorderLessonsDto): Promise<void> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const course = await this.courseRepo.findById(courseId, organisationId);
    if (!course) throw new NotFoundException('Course not found');

    const lessons = await this.courseRepo.listLessons(courseId);
    const existingIds = new Set(lessons.map((l) => l.id));
    if (dto.lessonIds.length !== lessons.length || dto.lessonIds.some((id) => !existingIds.has(id))) {
      throw new BadRequestException('lessonIds must contain exactly the existing lesson IDs of this course');
    }
    await this.courseRepo.reorderLessons(courseId, dto.lessonIds);
  }

  async removeLesson(req: AuthedRequest, courseId: string, lessonId: string): Promise<void> {
    this.requireWriteRole(req);
    const organisationId = assertActiveOrg(req);
    const course = await this.courseRepo.findById(courseId, organisationId);
    if (!course) throw new NotFoundException('Course not found');
    await this.courseRepo.removeLesson(courseId, lessonId);
  }

  // ---- completions ----

  async markLessonComplete(req: AuthedRequest, courseId: string, lessonId: string): Promise<void> {
    const organisationId = assertActiveOrg(req);
    const course = await this.courseRepo.findById(courseId, organisationId);
    if (!course) throw new NotFoundException('Course not found');
    const lesson = await this.courseRepo.findLessonById(lessonId);
    if (!lesson || lesson.course_id !== courseId) {
      throw new NotFoundException('Lesson not found on this course');
    }
    await this.courseRepo.markComplete({
      course_id: courseId,
      lesson_id: lessonId,
      athlete_user_id: req.user.id,
    });
  }

  async getProgress(req: AuthedRequest, courseId: string): Promise<CourseProgressResponse> {
    const organisationId = assertActiveOrg(req);
    const course = await this.courseRepo.findById(courseId, organisationId);
    if (!course) throw new NotFoundException('Course not found');

    const [lessons, completions] = await Promise.all([
      this.courseRepo.listLessons(courseId),
      this.courseRepo.listCompletionsForAthlete(courseId, req.user.id),
    ]);
    const completedIds = completions.map((c) => c.lesson_id);
    const totalLessons = lessons.length;
    const completedLessons = completedIds.length;

    return {
      data: {
        courseId,
        athleteUserId: req.user.id,
        totalLessons,
        completedLessons,
        completionRatio: totalLessons === 0 ? 0 : completedLessons / totalLessons,
        completedLessonIds: completedIds,
      },
    };
  }

  // ---- helpers ----

  private requireWriteRole(req: AuthedRequest): void {
    const role = req.activeOrg?.role;
    if (!role || !WRITE_ROLES.includes(role)) {
      throw new ForbiddenException('You need to be coach, admin or owner to manage courses in this organisation');
    }
  }

  private async mapToDTO(course: Course, lessonCount: number): Promise<CourseDTO> {
    return {
      id: course.id,
      organisationId: course.organisation_id,
      title: course.title,
      description: course.description,
      ownerUserId: course.owner_user_id,
      coverUrl: course.cover_s3_bucket && course.cover_s3_key
        ? await this.s3Service.getSignedUrlGET({
            bucket: course.cover_s3_bucket,
            key: course.cover_s3_key,
            expires: 3600,
          })
        : null,
      status: course.status,
      lessonCount,
      createdAt: this.toISO(course.created_at),
      updatedAt: this.toISO(course.updated_at),
    };
  }

  private toISO(v: unknown): string {
    if (v instanceof Date) return v.toISOString();
    return String(v);
  }
}
