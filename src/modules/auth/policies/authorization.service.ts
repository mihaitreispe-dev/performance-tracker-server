import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CoachAthleteStatus } from 'src/database/interfaces/coach-athlete-relationships-table.interface';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';

/**
 * Privacy fields that can be checked for coach-athlete relationships
 */
export type PrivacyField =
  | 'share_workouts'
  | 'share_executions'
  | 'share_analytics'
  | 'share_calendar'
  | 'share_personal_records'
  | 'share_sleep_data'
  | 'share_training_load';

/**
 * Result of an authorization check that includes both access status and context
 */
export interface AuthorizationResult {
  /** Whether access is granted */
  granted: boolean;
  /** Whether the user is the owner of the resource */
  isOwner: boolean;
  /** Whether access was granted via coaching relationship */
  isCoachAccess: boolean;
  /** The athlete's user ID if this is a coach-access scenario */
  athleteId?: string;
}

/**
 * Centralized authorization policy service
 *
 * This service consolidates authorization logic that was previously scattered
 * across multiple API services. Use this for:
 * - Checking resource ownership
 * - Validating coach-athlete relationships
 * - Checking privacy settings for coach access
 */
@Injectable()
export class AuthorizationService {
  constructor(
    private readonly relationshipRepo: CoachAthleteRelationshipRepository,
    private readonly privacySettingsRepo: AthletePrivacySettingsRepository,
  ) {}

  /**
   * Check if a user owns a resource
   *
   * @param userId - The user making the request
   * @param resourceOwnerId - The owner of the resource
   * @returns true if the user owns the resource
   */
  isOwner(userId: string, resourceOwnerId: string): boolean {
    return userId === resourceOwnerId;
  }

  /**
   * Assert that a user owns a resource, throwing NotFoundException if not
   *
   * @param userId - The user making the request
   * @param resourceOwnerId - The owner of the resource
   * @throws NotFoundException if the user doesn't own the resource
   */
  assertOwnership(userId: string, resourceOwnerId: string | undefined): void {
    if (!resourceOwnerId || userId !== resourceOwnerId) {
      throw new NotFoundException();
    }
  }

  /**
   * Assert ownership with a custom error message
   *
   * @param userId - The user making the request
   * @param resourceOwnerId - The owner of the resource
   * @param message - Custom error message
   * @throws ForbiddenException if the user doesn't own the resource
   */
  assertOwnershipWithForbidden(userId: string, resourceOwnerId: string | undefined, message = 'Access denied'): void {
    if (!resourceOwnerId || userId !== resourceOwnerId) {
      throw new ForbiddenException(message);
    }
  }

  /**
   * Check if a coach has an active relationship with an athlete
   *
   * @param coachId - The coach's user ID
   * @param athleteId - The athlete's user ID
   * @returns true if an active coaching relationship exists
   */
  async hasActiveCoachingRelationship(coachId: string, athleteId: string): Promise<boolean> {
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(coachId, athleteId);
    return relationship != null && relationship.status === CoachAthleteStatus.ACTIVE;
  }

  /**
   * Assert that a coach has an active relationship with an athlete
   *
   * @param coachId - The coach's user ID
   * @param athleteId - The athlete's user ID
   * @param message - Custom error message
   * @throws NotFoundException if no active relationship exists
   */
  async assertActiveCoachingRelationship(
    coachId: string,
    athleteId: string,
    message = 'Athlete not found in your roster',
  ): Promise<void> {
    const hasRelationship = await this.hasActiveCoachingRelationship(coachId, athleteId);
    if (!hasRelationship) {
      throw new NotFoundException(message);
    }
  }

  /**
   * Check if an athlete has shared a specific type of data with their coach
   *
   * @param athleteId - The athlete's user ID
   * @param privacyField - The privacy field to check
   * @returns true if the privacy setting allows access
   */
  async checkPrivacySetting(athleteId: string, privacyField: PrivacyField): Promise<boolean> {
    const settings = await this.privacySettingsRepo.findByUserId(athleteId);
    if (!settings) {
      return false;
    }
    return settings[privacyField] === true;
  }

  /**
   * Assert that an athlete has shared a specific type of data
   *
   * @param athleteId - The athlete's user ID
   * @param privacyField - The privacy field to check
   * @param message - Custom error message
   * @throws ForbiddenException if privacy setting doesn't allow access
   */
  async assertPrivacySetting(
    athleteId: string,
    privacyField: PrivacyField,
    message?: string,
  ): Promise<void> {
    const allowed = await this.checkPrivacySetting(athleteId, privacyField);
    if (!allowed) {
      const fieldName = privacyField.replace('share_', '').replace(/_/g, ' ');
      throw new ForbiddenException(message || `Athlete has not shared ${fieldName} with you`);
    }
  }

  /**
   * Check if a coach can access an athlete's data with privacy check
   *
   * This combines relationship check with privacy settings check.
   *
   * @param coachId - The coach's user ID
   * @param athleteId - The athlete's user ID
   * @param privacyField - The privacy field to check
   * @returns true if access is allowed
   */
  async canCoachAccessAthleteData(coachId: string, athleteId: string, privacyField: PrivacyField): Promise<boolean> {
    const hasRelationship = await this.hasActiveCoachingRelationship(coachId, athleteId);
    if (!hasRelationship) {
      return false;
    }
    return this.checkPrivacySetting(athleteId, privacyField);
  }

  /**
   * Assert that a coach can access an athlete's data
   *
   * @param coachId - The coach's user ID
   * @param athleteId - The athlete's user ID
   * @param privacyField - The privacy field to check
   * @throws NotFoundException if no active relationship exists
   * @throws ForbiddenException if privacy setting doesn't allow access
   */
  async assertCoachCanAccessAthleteData(
    coachId: string,
    athleteId: string,
    privacyField: PrivacyField,
  ): Promise<void> {
    await this.assertActiveCoachingRelationship(coachId, athleteId, 'No active coaching relationship found');
    await this.assertPrivacySetting(athleteId, privacyField);
  }

  /**
   * Check if a user can access a resource (either as owner or as coach)
   *
   * This is the primary method for checking access to user-owned resources.
   * It first checks ownership, then falls back to coach access if a privacy field is provided.
   *
   * @param requesterId - The user making the request
   * @param resourceOwnerId - The owner of the resource
   * @param privacyField - Optional privacy field for coach access
   * @returns AuthorizationResult with details about the access
   */
  async checkAccess(
    requesterId: string,
    resourceOwnerId: string,
    privacyField?: PrivacyField,
  ): Promise<AuthorizationResult> {
    // Check ownership first
    if (this.isOwner(requesterId, resourceOwnerId)) {
      return {
        granted: true,
        isOwner: true,
        isCoachAccess: false,
      };
    }

    // If no privacy field provided, deny access for non-owners
    if (!privacyField) {
      return {
        granted: false,
        isOwner: false,
        isCoachAccess: false,
      };
    }

    // Check coach access
    const canAccess = await this.canCoachAccessAthleteData(requesterId, resourceOwnerId, privacyField);
    return {
      granted: canAccess,
      isOwner: false,
      isCoachAccess: canAccess,
      athleteId: canAccess ? resourceOwnerId : undefined,
    };
  }

  /**
   * Assert that a user can access a resource (either as owner or as coach)
   *
   * @param requesterId - The user making the request
   * @param resourceOwnerId - The owner of the resource
   * @param privacyField - Optional privacy field for coach access
   * @throws NotFoundException if the resource is not found or not accessible
   * @throws ForbiddenException if access is denied due to privacy settings
   */
  async assertAccess(
    requesterId: string,
    resourceOwnerId: string | undefined,
    privacyField?: PrivacyField,
  ): Promise<AuthorizationResult> {
    if (!resourceOwnerId) {
      throw new NotFoundException();
    }

    const result = await this.checkAccess(requesterId, resourceOwnerId, privacyField);

    if (!result.granted) {
      if (privacyField) {
        // Could be either no relationship or privacy not shared
        await this.assertCoachCanAccessAthleteData(requesterId, resourceOwnerId, privacyField);
      }
      throw new ForbiddenException('Access denied');
    }

    return result;
  }

  /**
   * Check if a coach can modify/delete a schedule they created
   *
   * @param coachId - The coach's user ID
   * @param scheduleCreatedByCoachId - The coach ID that created the schedule
   * @returns true if the coach can modify the schedule
   */
  canModifyCoachCreatedSchedule(coachId: string, scheduleCreatedByCoachId: string | null): boolean {
    return scheduleCreatedByCoachId === coachId;
  }

  /**
   * Assert that a coach can modify a schedule they created
   *
   * @param coachId - The coach's user ID
   * @param scheduleCreatedByCoachId - The coach ID that created the schedule
   * @param message - Custom error message
   * @throws ForbiddenException if the coach didn't create the schedule
   */
  assertCanModifyCoachCreatedSchedule(
    coachId: string,
    scheduleCreatedByCoachId: string | null,
    message = 'You can only modify schedules you created',
  ): void {
    if (!this.canModifyCoachCreatedSchedule(coachId, scheduleCreatedByCoachId)) {
      throw new ForbiddenException(message);
    }
  }
}
