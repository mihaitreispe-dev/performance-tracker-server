import { DynamicModule, Module } from '@nestjs/common';

import { AuthModule } from 'src/modules/auth/auth.module';
import { S3Module } from 'src/modules/s3/s3.module';
import { StripeModule } from 'src/modules/stripe/stripe.module';
import { ResourceEntitlementsRepository } from 'src/repositories/resource-entitlements.repository';
import { StripeBillingRepository } from 'src/repositories/stripe-billing.repository';
import { OrganisationMembershipRepository } from 'src/repositories/organisation-membership.repository';
import { UserRepository } from 'src/repositories/user.repository';

import { PublicBillingService } from '../public/billing/public-billing.service';
import { MeApiController } from './me-api.controller';
import { MeApiService } from './me-api.service';

/**
 * The per-user "me" surface — entitlements, featured content,
 * device-token registration, and JWT-authed billing flow (products
 * list, checkout session, billing portal, current subscription).
 *
 * Reuses PublicBillingService for the Stripe flow so the business
 * logic (price validation, Connect-account routing, customer lazy-
 * create) lives in one place — only the auth boundary differs
 * between /v1/public/clients/:id/* (API key + path id) and
 * /v1/me/* (JWT + req.user).
 *
 * JWT-authenticated, X-Organisation-Id scoped.
 */
@Module({})
export class MeApiModule {
  private static instance?: DynamicModule;

  static register(): DynamicModule {
    if (!this.instance) {
      this.instance = {
        module: MeApiModule,
        imports: [AuthModule.register(), S3Module.register(), StripeModule.register()],
        providers: [
          MeApiService,
          PublicBillingService,
          UserRepository,
          StripeBillingRepository,
          ResourceEntitlementsRepository,
          OrganisationMembershipRepository,
        ],
        controllers: [MeApiController],
      };
    }
    return this.instance;
  }
}
