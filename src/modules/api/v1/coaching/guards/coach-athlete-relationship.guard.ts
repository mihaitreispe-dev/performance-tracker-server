import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CoachAthleteStatus } from 'src/database/interfaces';
import { AthletePrivacySettingsRepository } from 'src/repositories/athlete-privacy-settings.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';

export const PRIVACY_CHECK_KEY = 'privacy_check';
export type PrivacyField =
  | 'workouts'
  | 'executions'
  | 'analytics'
  | 'calendar'
  | 'personal_records'
  | 'sleep_data'
  | 'training_load';

export const RequirePrivacy = (...fields: PrivacyField[]) => {
  return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(PRIVACY_CHECK_KEY, fields, descriptor.value);
    return descriptor;
  };
};

@Injectable()
export class CoachAthleteRelationshipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly relationshipRepo: CoachAthleteRelationshipRepository,
    private readonly privacySettingsRepo: AthletePrivacySettingsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const coachId = request.user?.id;
    const athleteId = request.params?.athleteId;

    if (!coachId) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!athleteId) {
      throw new ForbiddenException('Athlete ID is required');
    }

    // Check if active relationship exists
    const relationship = await this.relationshipRepo.findActiveByCoachAndAthlete(coachId, athleteId);

    if (!relationship || relationship.status !== CoachAthleteStatus.ACTIVE) {
      throw new NotFoundException('No active coaching relationship found with this athlete');
    }

    // Check privacy settings if required
    const requiredPrivacyFields = this.reflector.get<PrivacyField[]>(PRIVACY_CHECK_KEY, context.getHandler());

    if (requiredPrivacyFields && requiredPrivacyFields.length > 0) {
      const privacySettings = await this.privacySettingsRepo.getOrCreateDefault(athleteId);

      for (const field of requiredPrivacyFields) {
        const settingKey = this.getPrivacySettingKey(field);
        if (!privacySettings[settingKey]) {
          throw new ForbiddenException(`Athlete has not shared ${field.replace('_', ' ')} data with coaches`);
        }
      }
    }

    // Attach relationship and privacy settings to request for use in controller/service
    request.coachAthleteRelationship = relationship;

    return true;
  }

  private getPrivacySettingKey(field: PrivacyField): keyof {
    share_workouts: boolean;
    share_executions: boolean;
    share_analytics: boolean;
    share_calendar: boolean;
    share_personal_records: boolean;
    share_sleep_data: boolean;
    share_training_load: boolean;
  } {
    const mapping: Record<PrivacyField, string> = {
      workouts: 'share_workouts',
      executions: 'share_executions',
      analytics: 'share_analytics',
      calendar: 'share_calendar',
      personal_records: 'share_personal_records',
      sleep_data: 'share_sleep_data',
      training_load: 'share_training_load',
    };
    return mapping[field] as any;
  }
}
