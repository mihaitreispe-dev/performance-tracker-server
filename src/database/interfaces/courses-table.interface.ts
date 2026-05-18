import { Generated, Insertable, Selectable, Updateable } from 'kysely';

import { Timestamp } from './timestamp';

export enum CourseStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export interface CoursesTable {
  id: Generated<string>;
  organisation_id: string;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  cover_s3_bucket: string | null;
  cover_s3_key: string | null;
  status: CourseStatus;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export type Course = Selectable<CoursesTable>;
export type NewCourse = Insertable<CoursesTable>;
export type CourseUpdate = Updateable<CoursesTable>;

export interface CourseLessonsTable {
  id: Generated<string>;
  course_id: string;
  content_item_id: string;
  sort_order: number;
  created_at: Generated<Timestamp>;
}

export type CourseLesson = Selectable<CourseLessonsTable>;
export type NewCourseLesson = Insertable<CourseLessonsTable>;
export type CourseLessonUpdate = Updateable<CourseLessonsTable>;

export interface CourseCompletionsTable {
  id: Generated<string>;
  course_id: string;
  lesson_id: string;
  athlete_user_id: string;
  completed_at: Generated<Timestamp>;
}

export type CourseCompletion = Selectable<CourseCompletionsTable>;
export type NewCourseCompletion = Insertable<CourseCompletionsTable>;
