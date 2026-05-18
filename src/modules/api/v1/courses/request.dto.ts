import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CourseStatus } from 'src/database/interfaces';

export class CreateCourseDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateCourseDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: CourseStatus })
  @IsEnum(CourseStatus)
  @IsOptional()
  status?: CourseStatus;
}

export class ListCoursesQuery {
  @ApiPropertyOptional({ enum: CourseStatus })
  @IsEnum(CourseStatus)
  @IsOptional()
  status?: CourseStatus;

  @ApiPropertyOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @Transform(({ value }) => Number.parseInt(value, 10))
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

export class AddLessonDto {
  @ApiProperty({ description: 'ID of the content_item (kind=COURSE_LESSON) to attach' })
  @IsUUID()
  contentItemId: string;
}

export class ReorderLessonsDto {
  @ApiProperty({ type: [String], description: 'Lesson IDs in their new order' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  lessonIds: string[];
}

export class CourseIdParam {
  @ApiProperty()
  @IsUUID()
  id: string;
}

export class CourseLessonIdParams {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  lessonId: string;
}
