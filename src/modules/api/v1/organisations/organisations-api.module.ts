import { DynamicModule, Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { AppConfigModule } from 'src/modules/config/app-config.module';
import { EntitlementsService } from 'src/modules/entitlements/entitlements.service';
import { S3Module } from 'src/modules/s3/s3.module';
import { StripeModule } from 'src/modules/stripe/stripe.module';
import { ContentItemRepository } from 'src/repositories/content-item.repository';
import { CourseRepository } from 'src/repositories/course.repository';
import { OrganisationRepository } from 'src/repositories/organisation.repository';
import { ModuleRepository } from 'src/repositories/module.repository';
import { OrganisationApiKeyRepository } from 'src/repositories/organisation-api-key.repository';
import { OrganisationApiUsageRepository } from 'src/repositories/organisation-api-usage.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { OrganisationThemeRepository } from 'src/repositories/organisation-theme.repository';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { CoachAssignedWorkoutRepository } from 'src/repositories/coach-assigned-workout.repository';
import { CoachAthleteRelationshipRepository } from 'src/repositories/coach-athlete-relationship.repository';
import { MembershipAuditLogRepository } from 'src/repositories/membership-audit-log.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { WorkoutRepository } from 'src/repositories/workout.repository';
import { WorkoutScheduleRepository } from 'src/repositories/workout-schedule.repository';

import { ApiKeysApiController } from './api-keys/api-keys-api.controller';
import { ApiKeysApiService } from './api-keys/api-keys-api.service';
import { BillingApiController } from './billing/billing-api.controller';
import { BillingApiService } from './billing/billing-api.service';
import { ClientProfilesApiController } from './client-profiles/client-profiles-api.controller';
import { ClientProfilesApiService } from './client-profiles/client-profiles-api.service';
import { ClientProvisioningService } from './client-profiles/client-provisioning.service';
import { EntitlementsApiController } from './entitlements/entitlements-api.controller';
import { EntitlementsApiService } from './entitlements/entitlements-api.service';
import { MembershipsApiController } from './memberships/memberships-api.controller';
import { MembershipsApiService } from './memberships/memberships-api.service';
import { OrganisationsApiController } from './organisations-api.controller';
import { OrganisationsApiService } from './organisations-api.service';
import { ThemesApiController } from './themes/themes-api.controller';
import { ThemesApiService } from './themes/themes-api.service';

@Module({})
export class OrganisationsApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: OrganisationsApiModule,
        imports: [AuthModule.register(), AppConfigModule.register(), S3Module.register(), StripeModule.register()],
        providers: [
          OrganisationsApiService,
          MembershipsApiService,
          ThemesApiService,
          ApiKeysApiService,
          BillingApiService,
          ClientProfilesApiService,
          ClientProvisioningService,
          EntitlementsApiService,
          // EntitlementsService is shared with the public read surface
          // (PublicApiModule re-provides it there); registering it here
          // keeps the admin controller standalone and avoids forcing
          // OrganisationsApiModule to depend on the public module.
          EntitlementsService,
          OrganisationRepository,
          OrganisationMembershipRepository,
          OrganisationThemeRepository,
          OrganisationApiKeyRepository,
          OrganisationApiUsageRepository,
          ResourceEntitlementsRepository,
          StripeBillingRepository,
          // EntitlementsService needs to peek at the underlying resource
          // tables to do the "does this workout/course/snack actually
          // belong to this org?" guard before mutating gate rows.
          WorkoutRepository,
          CourseRepository,
          ContentItemRepository,
          ModuleRepository,
          UserRepository,
          // Memberships auto-create a coach_athlete_relationships row
          // when a coach invites an athlete, so the coach can read
          // that athlete's data through the relationship-gated
          // endpoints (workouts/executions/metrics).
          CoachAthleteRelationshipRepository,
          // Append-only audit log written on every membership
          // mutation (invite/accept/role_changed/removed/self_left).
          MembershipAuditLogRepository,
          // Deprovisioning cascade on membership removal cleans the
          // departing user's org-scoped coaching assignments + schedules.
          CoachAssignedWorkoutRepository,
          WorkoutScheduleRepository,
        ],
        controllers: [
          OrganisationsApiController,
          MembershipsApiController,
          ThemesApiController,
          ApiKeysApiController,
          BillingApiController,
          ClientProfilesApiController,
          EntitlementsApiController,
        ],
        exports: [
          OrganisationsApiService,
          OrganisationRepository,
          OrganisationMembershipRepository,
          OrganisationApiKeyRepository,
          OrganisationApiUsageRepository,
          ResourceEntitlementsRepository,
          StripeBillingRepository,
        ],
      };
    }
    return this.instance;
  }
}
