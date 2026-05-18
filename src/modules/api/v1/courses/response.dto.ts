import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseStatus } from 'src/database/interfaces';

import { ContentItemDTO } from '../content-items/response.dto';

export class CourseDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organisationId: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  ownerUserId: string | null;

  @ApiPropertyOptional({ nullable: true })
  coverUrl: string | null;

  @ApiProperty({ enum: CourseStatus })
  status: CourseStatus;

  @ApiProperty()
  lessonCount: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class CourseLessonDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  courseId: string;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: ContentItemDTO })
  contentItem: ContentItemDTO;
}

export class CourseWithLessonsDTO extends CourseDTO {
  @ApiProperty({ type: [CourseLessonDTO] })
  lessons: CourseLessonDTO[];
}

export class CourseResponse {
  @ApiProperty({ type: CourseDTO })
  data: CourseDTO;
}

export class CourseWithLessonsResponse {
  @ApiProperty({ type: CourseWithLessonsDTO })
  data: CourseWithLessonsDTO;
}

export class CoursesListResponse {
  @ApiProperty({ type: [CourseDTO] })
  data: CourseDTO[];
}

export class CourseLessonResponse {
  @ApiProperty({ type: CourseLessonDTO })
  data: CourseLessonDTO;
}

export class CourseProgressDTO {
  @ApiProperty()
  courseId: string;

  @ApiProperty()
  athleteUserId: string;

  @ApiProperty()
  totalLessons: number;

  @ApiProperty()
  completedLessons: number;

  @ApiProperty()
  completionRatio: number;

  @ApiProperty({ type: [String], description: 'IDs of lessons the athlete has completed' })
  completedLessonIds: string[];
}

export class CourseProgressResponse {
  @ApiProperty({ type: CourseProgressDTO })
  data: CourseProgressDTO;
}
