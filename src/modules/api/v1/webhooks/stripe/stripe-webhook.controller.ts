import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';

import { DisableJwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { SkipActiveOrg } from 'src/modules/auth/guards/active-org.guard';

import { StripeWebhookService } from './stripe-webhook.service';

/**
 * Stripe Connect webhook endpoint. Public (Stripe's IPs aren't behind JWT),
 * signature is the security boundary.
 *
 * The raw request body is captured by the body-parser `verify` hook in
 * `api-v1.app.module.ts` (look for `req.rawBody`); we hand that string straight
 * to the Stripe SDK for HMAC verification.
 *
 * Excluded from Swagger — third parties don't call this, Stripe does.
 */
@Controller('webhooks/stripe')
@DisableJwtAuthGuard()
@SkipActiveOrg()
export class StripeWebhookController {
  constructor(private readonly service: StripeWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handle(
    @Req() req: Request & { rawBody?: string },
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ id: string; type: string; deduped: boolean }> {
    return this.service.handle(req.rawBody, signature);
  }
}
