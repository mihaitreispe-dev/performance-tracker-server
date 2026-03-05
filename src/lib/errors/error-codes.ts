import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';

/**
 * Standardized error codes for the Performance Tracker API
 *
 * Error codes follow the pattern: DOMAIN_ERROR_TYPE
 * Examples: WORKOUT_NOT_FOUND, AUTH_UNAUTHORIZED, COACHING_RELATIONSHIP_NOT_FOUND
 */
export const ErrorCodes = {
  // =====================
  // Authentication Errors
  // =====================
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',

  // =====================
  // User Errors
  // =====================
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',

  // =====================
  // Workout Errors
  // =====================
  WORKOUT_NOT_FOUND: 'WORKOUT_NOT_FOUND',
  WORKOUT_ACCESS_DENIED: 'WORKOUT_ACCESS_DENIED',
  WORKOUT_INVALID_STATE: 'WORKOUT_INVALID_STATE',

  // =====================
  // Workout Execution Errors
  // =====================
  EXECUTION_NOT_FOUND: 'EXECUTION_NOT_FOUND',
  EXECUTION_ACCESS_DENIED: 'EXECUTION_ACCESS_DENIED',
  EXECUTION_ALREADY_COMPLETED: 'EXECUTION_ALREADY_COMPLETED',
  EXECUTION_NOT_STARTED: 'EXECUTION_NOT_STARTED',

  // =====================
  // Workout Plan Errors
  // =====================
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND',
  PLAN_ACCESS_DENIED: 'PLAN_ACCESS_DENIED',

  // =====================
  // Workout Schedule Errors
  // =====================
  SCHEDULE_NOT_FOUND: 'SCHEDULE_NOT_FOUND',
  SCHEDULE_ACCESS_DENIED: 'SCHEDULE_ACCESS_DENIED',
  SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT',

  // =====================
  // Exercise Errors
  // =====================
  EXERCISE_NOT_FOUND: 'EXERCISE_NOT_FOUND',
  EXERCISE_ACCESS_DENIED: 'EXERCISE_ACCESS_DENIED',

  // =====================
  // Coaching Errors
  // =====================
  COACHING_RELATIONSHIP_NOT_FOUND: 'COACHING_RELATIONSHIP_NOT_FOUND',
  COACHING_ATHLETE_NOT_IN_ROSTER: 'COACHING_ATHLETE_NOT_IN_ROSTER',
  COACHING_ALREADY_INVITED: 'COACHING_ALREADY_INVITED',
  COACHING_SELF_INVITE: 'COACHING_SELF_INVITE',
  COACHING_PRIVACY_DENIED: 'COACHING_PRIVACY_DENIED',
  COACHING_MESSAGE_NOT_FOUND: 'COACHING_MESSAGE_NOT_FOUND',

  // =====================
  // Analytics Errors
  // =====================
  ANALYTICS_ACCESS_DENIED: 'ANALYTICS_ACCESS_DENIED',
  ANALYTICS_INVALID_DATE_RANGE: 'ANALYTICS_INVALID_DATE_RANGE',

  // =====================
  // Import/Export Errors
  // =====================
  IMPORT_JOB_NOT_FOUND: 'IMPORT_JOB_NOT_FOUND',
  IMPORT_FILE_NOT_FOUND: 'IMPORT_FILE_NOT_FOUND',
  IMPORT_INVALID_STATE: 'IMPORT_INVALID_STATE',
  IMPORT_PROCESSING_FAILED: 'IMPORT_PROCESSING_FAILED',
  EXPORT_JOB_NOT_FOUND: 'EXPORT_JOB_NOT_FOUND',
  EXPORT_NOT_READY: 'EXPORT_NOT_READY',
  EXPORT_EXPIRED: 'EXPORT_EXPIRED',

  // =====================
  // Validation Errors
  // =====================
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',

  // =====================
  // Rate Limiting Errors
  // =====================
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // =====================
  // General Errors
  // =====================
  NOT_FOUND: 'NOT_FOUND',
  ACCESS_DENIED: 'ACCESS_DENIED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Default error messages for each error code
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Authentication
  [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 'Invalid credentials',
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'Token has expired',
  [ErrorCodes.AUTH_TOKEN_INVALID]: 'Invalid token',
  [ErrorCodes.AUTH_UNAUTHORIZED]: 'Unauthorized',

  // User
  [ErrorCodes.USER_NOT_FOUND]: 'User not found',
  [ErrorCodes.USER_ALREADY_EXISTS]: 'User already exists',

  // Workout
  [ErrorCodes.WORKOUT_NOT_FOUND]: 'Workout not found',
  [ErrorCodes.WORKOUT_ACCESS_DENIED]: 'Access to workout denied',
  [ErrorCodes.WORKOUT_INVALID_STATE]: 'Workout is in an invalid state for this operation',

  // Workout Execution
  [ErrorCodes.EXECUTION_NOT_FOUND]: 'Workout execution not found',
  [ErrorCodes.EXECUTION_ACCESS_DENIED]: 'Access to workout execution denied',
  [ErrorCodes.EXECUTION_ALREADY_COMPLETED]: 'Workout execution is already completed',
  [ErrorCodes.EXECUTION_NOT_STARTED]: 'Workout execution has not been started',

  // Workout Plan
  [ErrorCodes.PLAN_NOT_FOUND]: 'Workout plan not found',
  [ErrorCodes.PLAN_ACCESS_DENIED]: 'Access to workout plan denied',

  // Workout Schedule
  [ErrorCodes.SCHEDULE_NOT_FOUND]: 'Workout schedule not found',
  [ErrorCodes.SCHEDULE_ACCESS_DENIED]: 'Access to workout schedule denied',
  [ErrorCodes.SCHEDULE_CONFLICT]: 'Schedule conflict detected',

  // Exercise
  [ErrorCodes.EXERCISE_NOT_FOUND]: 'Exercise not found',
  [ErrorCodes.EXERCISE_ACCESS_DENIED]: 'Access to exercise denied',

  // Coaching
  [ErrorCodes.COACHING_RELATIONSHIP_NOT_FOUND]: 'No active coaching relationship found',
  [ErrorCodes.COACHING_ATHLETE_NOT_IN_ROSTER]: 'Athlete not found in your roster',
  [ErrorCodes.COACHING_ALREADY_INVITED]: 'Athlete has already been invited',
  [ErrorCodes.COACHING_SELF_INVITE]: 'You cannot invite yourself',
  [ErrorCodes.COACHING_PRIVACY_DENIED]: 'Athlete has not shared this data with you',
  [ErrorCodes.COACHING_MESSAGE_NOT_FOUND]: 'Message not found',

  // Analytics
  [ErrorCodes.ANALYTICS_ACCESS_DENIED]: 'Access to analytics denied',
  [ErrorCodes.ANALYTICS_INVALID_DATE_RANGE]: 'Invalid date range',

  // Import/Export
  [ErrorCodes.IMPORT_JOB_NOT_FOUND]: 'Import job not found',
  [ErrorCodes.IMPORT_FILE_NOT_FOUND]: 'Import file not found',
  [ErrorCodes.IMPORT_INVALID_STATE]: 'Import job is in an invalid state for this operation',
  [ErrorCodes.IMPORT_PROCESSING_FAILED]: 'Import processing failed',
  [ErrorCodes.EXPORT_JOB_NOT_FOUND]: 'Export job not found',
  [ErrorCodes.EXPORT_NOT_READY]: 'Export is not ready for download',
  [ErrorCodes.EXPORT_EXPIRED]: 'Export has expired',

  // Validation
  [ErrorCodes.VALIDATION_FAILED]: 'Validation failed',
  [ErrorCodes.INVALID_INPUT]: 'Invalid input',

  // Rate Limiting
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded. Please try again later.',

  // General
  [ErrorCodes.NOT_FOUND]: 'Resource not found',
  [ErrorCodes.ACCESS_DENIED]: 'Access denied',
  [ErrorCodes.INTERNAL_ERROR]: 'An internal error occurred',
};

/**
 * API Error class that includes an error code
 *
 * Use this to create consistent, machine-readable errors
 */
export class ApiException {
  constructor(
    public readonly code: ErrorCode,
    public readonly message?: string,
    public readonly target?: string,
  ) {}

  getMessage(): string {
    return this.message || ErrorMessages[this.code];
  }
}

/**
 * Factory functions for creating typed HTTP exceptions with error codes
 */
export const AppErrors = {
  // Not Found Errors
  notFound(code: ErrorCode = ErrorCodes.NOT_FOUND, message?: string): NotFoundException {
    const msg = message || ErrorMessages[code];
    return new NotFoundException({ code, message: msg });
  },

  workoutNotFound(id?: string): NotFoundException {
    const message = id ? `Workout ${id} not found` : ErrorMessages[ErrorCodes.WORKOUT_NOT_FOUND];
    return new NotFoundException({ code: ErrorCodes.WORKOUT_NOT_FOUND, message });
  },

  executionNotFound(id?: string): NotFoundException {
    const message = id ? `Workout execution ${id} not found` : ErrorMessages[ErrorCodes.EXECUTION_NOT_FOUND];
    return new NotFoundException({ code: ErrorCodes.EXECUTION_NOT_FOUND, message });
  },

  planNotFound(id?: string): NotFoundException {
    const message = id ? `Workout plan ${id} not found` : ErrorMessages[ErrorCodes.PLAN_NOT_FOUND];
    return new NotFoundException({ code: ErrorCodes.PLAN_NOT_FOUND, message });
  },

  scheduleNotFound(id?: string): NotFoundException {
    const message = id ? `Workout schedule ${id} not found` : ErrorMessages[ErrorCodes.SCHEDULE_NOT_FOUND];
    return new NotFoundException({ code: ErrorCodes.SCHEDULE_NOT_FOUND, message });
  },

  exerciseNotFound(id?: string): NotFoundException {
    const message = id ? `Exercise ${id} not found` : ErrorMessages[ErrorCodes.EXERCISE_NOT_FOUND];
    return new NotFoundException({ code: ErrorCodes.EXERCISE_NOT_FOUND, message });
  },

  userNotFound(id?: string): NotFoundException {
    const message = id ? `User ${id} not found` : ErrorMessages[ErrorCodes.USER_NOT_FOUND];
    return new NotFoundException({ code: ErrorCodes.USER_NOT_FOUND, message });
  },

  importJobNotFound(id?: string): NotFoundException {
    const message = id ? `Import job ${id} not found` : ErrorMessages[ErrorCodes.IMPORT_JOB_NOT_FOUND];
    return new NotFoundException({ code: ErrorCodes.IMPORT_JOB_NOT_FOUND, message });
  },

  exportJobNotFound(id?: string): NotFoundException {
    const message = id ? `Export job ${id} not found` : ErrorMessages[ErrorCodes.EXPORT_JOB_NOT_FOUND];
    return new NotFoundException({ code: ErrorCodes.EXPORT_JOB_NOT_FOUND, message });
  },

  // Coaching Not Found
  athleteNotInRoster(): NotFoundException {
    return new NotFoundException({
      code: ErrorCodes.COACHING_ATHLETE_NOT_IN_ROSTER,
      message: ErrorMessages[ErrorCodes.COACHING_ATHLETE_NOT_IN_ROSTER],
    });
  },

  relationshipNotFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCodes.COACHING_RELATIONSHIP_NOT_FOUND,
      message: ErrorMessages[ErrorCodes.COACHING_RELATIONSHIP_NOT_FOUND],
    });
  },

  messageNotFound(id?: string): NotFoundException {
    const message = id ? `Message ${id} not found` : ErrorMessages[ErrorCodes.COACHING_MESSAGE_NOT_FOUND];
    return new NotFoundException({ code: ErrorCodes.COACHING_MESSAGE_NOT_FOUND, message });
  },

  // Forbidden/Access Denied Errors
  forbidden(code: ErrorCode = ErrorCodes.ACCESS_DENIED, message?: string): ForbiddenException {
    const msg = message || ErrorMessages[code];
    return new ForbiddenException({ code, message: msg });
  },

  accessDenied(resource?: string): ForbiddenException {
    const message = resource ? `Access to ${resource} denied` : ErrorMessages[ErrorCodes.ACCESS_DENIED];
    return new ForbiddenException({ code: ErrorCodes.ACCESS_DENIED, message });
  },

  workoutAccessDenied(): ForbiddenException {
    return new ForbiddenException({
      code: ErrorCodes.WORKOUT_ACCESS_DENIED,
      message: ErrorMessages[ErrorCodes.WORKOUT_ACCESS_DENIED],
    });
  },

  executionAccessDenied(): ForbiddenException {
    return new ForbiddenException({
      code: ErrorCodes.EXECUTION_ACCESS_DENIED,
      message: ErrorMessages[ErrorCodes.EXECUTION_ACCESS_DENIED],
    });
  },

  planAccessDenied(): ForbiddenException {
    return new ForbiddenException({
      code: ErrorCodes.PLAN_ACCESS_DENIED,
      message: ErrorMessages[ErrorCodes.PLAN_ACCESS_DENIED],
    });
  },

  scheduleAccessDenied(): ForbiddenException {
    return new ForbiddenException({
      code: ErrorCodes.SCHEDULE_ACCESS_DENIED,
      message: ErrorMessages[ErrorCodes.SCHEDULE_ACCESS_DENIED],
    });
  },

  privacyDenied(dataType?: string): ForbiddenException {
    const message = dataType
      ? `Athlete has not shared ${dataType} with you`
      : ErrorMessages[ErrorCodes.COACHING_PRIVACY_DENIED];
    return new ForbiddenException({ code: ErrorCodes.COACHING_PRIVACY_DENIED, message });
  },

  analyticsAccessDenied(): ForbiddenException {
    return new ForbiddenException({
      code: ErrorCodes.ANALYTICS_ACCESS_DENIED,
      message: ErrorMessages[ErrorCodes.ANALYTICS_ACCESS_DENIED],
    });
  },

  // Bad Request Errors
  badRequest(code: ErrorCode = ErrorCodes.INVALID_INPUT, message?: string): BadRequestException {
    const msg = message || ErrorMessages[code];
    return new BadRequestException({ code, message: msg });
  },

  invalidState(resource: string, operation?: string): BadRequestException {
    const message = operation
      ? `${resource} is in an invalid state for ${operation}`
      : `${resource} is in an invalid state for this operation`;
    return new BadRequestException({ code: ErrorCodes.WORKOUT_INVALID_STATE, message });
  },

  executionAlreadyCompleted(): BadRequestException {
    return new BadRequestException({
      code: ErrorCodes.EXECUTION_ALREADY_COMPLETED,
      message: ErrorMessages[ErrorCodes.EXECUTION_ALREADY_COMPLETED],
    });
  },

  importInvalidState(operation?: string): BadRequestException {
    const message = operation
      ? `Import job is in an invalid state for ${operation}`
      : ErrorMessages[ErrorCodes.IMPORT_INVALID_STATE];
    return new BadRequestException({ code: ErrorCodes.IMPORT_INVALID_STATE, message });
  },

  exportNotReady(): BadRequestException {
    return new BadRequestException({
      code: ErrorCodes.EXPORT_NOT_READY,
      message: ErrorMessages[ErrorCodes.EXPORT_NOT_READY],
    });
  },

  exportExpired(): BadRequestException {
    return new BadRequestException({
      code: ErrorCodes.EXPORT_EXPIRED,
      message: ErrorMessages[ErrorCodes.EXPORT_EXPIRED],
    });
  },

  selfInvite(): BadRequestException {
    return new BadRequestException({
      code: ErrorCodes.COACHING_SELF_INVITE,
      message: ErrorMessages[ErrorCodes.COACHING_SELF_INVITE],
    });
  },

  alreadyInvited(): BadRequestException {
    return new BadRequestException({
      code: ErrorCodes.COACHING_ALREADY_INVITED,
      message: ErrorMessages[ErrorCodes.COACHING_ALREADY_INVITED],
    });
  },

  // Unauthorized Errors
  unauthorized(code: ErrorCode = ErrorCodes.AUTH_UNAUTHORIZED, message?: string): UnauthorizedException {
    const msg = message || ErrorMessages[code];
    return new UnauthorizedException({ code, message: msg });
  },

  invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCodes.AUTH_INVALID_CREDENTIALS,
      message: ErrorMessages[ErrorCodes.AUTH_INVALID_CREDENTIALS],
    });
  },

  tokenExpired(): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCodes.AUTH_TOKEN_EXPIRED,
      message: ErrorMessages[ErrorCodes.AUTH_TOKEN_EXPIRED],
    });
  },

  tokenInvalid(): UnauthorizedException {
    return new UnauthorizedException({
      code: ErrorCodes.AUTH_TOKEN_INVALID,
      message: ErrorMessages[ErrorCodes.AUTH_TOKEN_INVALID],
    });
  },
};
