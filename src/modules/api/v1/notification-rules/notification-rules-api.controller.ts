import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import {
  NotificationAudienceFilter,
  NotificationRule,
  OrganisationRole,
} from 'src/database/interfaces';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import type { AuthUser } from 'src/modules/auth/types/authenticated-user';
import type { ActiveOrgContext } from 'src/modules/auth/guards/active-org.guard';
import { NotificationRuleRepository } from 'src/repositories/notification-rule.repository';

import { NotificationRulesService } from 'src/modules/notification-rules/notification-rules.service';

import {
  CreateNotificationRuleBody,
  NotificationRuleIdParam,
  UpdateNotificationRuleBody,
} from './request.dto';
import {
  NotificationDispatchResultResponse,
  NotificationRuleDTO,
  NotificationRuleDeliveriesResponse,
  NotificationRuleListResponse,
  NotificationRuleResponse,
} from './response.dto';

type AuthedReq = Request & { user: AuthUser; activeOrg?: ActiveOrgContext };

/**
 * Org-admin authoring surface for push notification rules.
 *
 * JWT + X-Organisation-Id scoped. All endpoints require the caller to
 * be an owner or admin of the active org. Athletes/coaches don't have
 * access (notification authoring is an admin concern).
 *
 * Rule CRUD only here — the engine + cron live in the
 * NotificationRulesModule and run independently.
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notification-rules')
export class NotificationRulesApiController {
  constructor(
    private readonly repo: NotificationRuleRepository,
    private readonly engine: NotificationRulesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notification rules for the active org' })
  @ApiOkResponse({ type: NotificationRuleListResponse })
  async list(@Req() req: AuthedReq): Promise<NotificationRuleListResponse> {
    const orgId = this.requireAdminOrg(req);
    const rows = await this.repo.listByOrg(orgId);
    return { data: rows.map(toDTO) };
  }

  @Post()
  @ApiOperation({ summary: 'Create a notification rule' })
  @ApiCreatedResponse({ type: NotificationRuleResponse })
  async create(
    @Req() req: AuthedReq,
    @Body() body: CreateNotificationRuleBody,
  ): Promise<NotificationRuleResponse> {
    const orgId = this.requireAdminOrg(req);
    const created = await this.repo.create({
      organisation_id: orgId,
      created_by_user_id: req.user.id,
      name: body.name,
      enabled: body.enabled ?? true,
      trigger_type: body.triggerType,
      cron_expression: body.cronExpression ?? null,
      event_filter: body.eventFilter ?? {},
      condition_params: body.conditionParams ?? {},
      audience_filter: body.audienceFilter as NotificationAudienceFilter,
      title: body.title,
      body: body.body,
      click_action: body.clickAction ?? null,
    });
    return { data: toDTO(created) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a notification rule' })
  @ApiOkResponse({ type: NotificationRuleResponse })
  async update(
    @Req() req: AuthedReq,
    @Param() params: NotificationRuleIdParam,
    @Body() body: UpdateNotificationRuleBody,
  ): Promise<NotificationRuleResponse> {
    const orgId = this.requireAdminOrg(req);
    const existing = await this.repo.findByIdInOrg(params.id, orgId);
    if (!existing) throw new NotFoundException('Rule not found');
    const updated = await this.repo.update(params.id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.cronExpression !== undefined ? { cron_expression: body.cronExpression } : {}),
      ...(body.eventFilter !== undefined ? { event_filter: body.eventFilter } : {}),
      ...(body.conditionParams !== undefined ? { condition_params: body.conditionParams } : {}),
      ...(body.audienceFilter !== undefined
        ? { audience_filter: body.audienceFilter as NotificationAudienceFilter }
        : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.clickAction !== undefined ? { click_action: body.clickAction } : {}),
    });
    return { data: toDTO(updated) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a notification rule' })
  @ApiNoContentResponse()
  async delete(@Req() req: AuthedReq, @Param() params: NotificationRuleIdParam): Promise<void> {
    const orgId = this.requireAdminOrg(req);
    const existing = await this.repo.findByIdInOrg(params.id, orgId);
    if (!existing) throw new NotFoundException('Rule not found');
    await this.repo.delete(params.id);
  }

  @Get(':id/deliveries')
  @ApiOperation({
    summary:
      'List recent deliveries for a rule — append-only audit log. Newest first, capped at 200.',
  })
  @ApiOkResponse({ type: NotificationRuleDeliveriesResponse })
  async listDeliveries(
    @Req() req: AuthedReq,
    @Param() params: NotificationRuleIdParam,
    @Query('limit') limitRaw?: string,
  ): Promise<NotificationRuleDeliveriesResponse> {
    const orgId = this.requireAdminOrg(req);
    // Verify the rule is in this org before reading its delivery log —
    // the deliveries table is also organisation-scoped, but checking
    // the parent row gives us a 404 instead of an empty list when the
    // id was guessed.
    const existing = await this.repo.findByIdInOrg(params.id, orgId);
    if (!existing) throw new NotFoundException('Rule not found');
    const limit = limitRaw ? Math.max(1, Math.min(parseInt(limitRaw, 10) || 50, 200)) : 50;
    const rows = await this.repo.listDeliveriesForRule(params.id, orgId, limit);
    return {
      data: rows.map((r) => ({
        id: r.id,
        ruleId: r.rule_id,
        userId: r.user_id,
        userDisplayName: r.userDisplayName,
        userEmail: r.userEmail,
        sentAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : String(r.sent_at),
        route: r.route,
        ok: r.ok,
        error: r.error,
      })),
    };
  }

  @Post(':id/test')
  @ApiOperation({
    summary:
      "Fire a rule immediately for its current audience, bypassing the dedupe window. Useful for previewing copy.",
  })
  @ApiCreatedResponse({ type: NotificationDispatchResultResponse })
  async testSend(
    @Req() req: AuthedReq,
    @Param() params: NotificationRuleIdParam,
  ): Promise<NotificationDispatchResultResponse> {
    const orgId = this.requireAdminOrg(req);
    const result = await this.engine.testSend(params.id, orgId);
    return { data: result };
  }

  // -------- helpers --------

  /**
   * Resolve the active org id from the JWT + X-Organisation-Id header,
   * then enforce owner/admin. ActiveOrgGuard already populates the role
   * from the membership row.
   */
  private requireAdminOrg(req: AuthedReq): string {
    const ctx = req.activeOrg;
    if (!ctx) throw new NotFoundException('Active organisation required');
    if (ctx.role !== OrganisationRole.OWNER && ctx.role !== OrganisationRole.ADMIN) {
      throw new ForbiddenException('Only org owners and admins can manage notification rules');
    }
    return ctx.organisationId;
  }
}

function toDTO(r: NotificationRule): NotificationRuleDTO {
  return {
    id: r.id,
    organisationId: r.organisation_id,
    name: r.name,
    enabled: r.enabled,
    triggerType: r.trigger_type,
    cronExpression: r.cron_expression,
    eventFilter: r.event_filter as Record<string, unknown>,
    conditionParams: r.condition_params as Record<string, unknown>,
    audienceFilter: r.audience_filter as Record<string, unknown>,
    title: r.title,
    body: r.body,
    clickAction: r.click_action,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt:
      r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}
