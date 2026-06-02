import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from 'src/modules/auth/types/authenticated-user';
import { PlayerQoeEventRepository } from 'src/repositories/player-qoe-event.repository';

import { IngestPlayerTelemetryDto } from './request.dto';

@Injectable()
export class PlayerTelemetryApiService {
  constructor(private readonly repo: PlayerQoeEventRepository) {}

  /**
   * Bulk-write a batch of telemetry events. The caller's user_id and
   * the active org_id (when present on the request) get stamped onto
   * every row server-side — the client never sends them.
   *
   * Fire-and-forget shape: returns void so the client doesn't wait on
   * the DB write before continuing whatever the user is doing.
   * Failures are swallowed at the call site to keep telemetry
   * non-blocking.
   */
  async ingest(req: Request & { user: AuthUser }, body: IngestPlayerTelemetryDto): Promise<void> {
    // Active org id lands on the request via the ActiveOrgGuard
    // upstream. Coerce undefined → null so the jsonb insert is well-
    // typed.
    const organisationId =
      (req as unknown as { organisationId?: string }).organisationId ?? null;
    await this.repo.insertMany(
      body.events.map((e) => ({
        user_id: req.user.id,
        organisation_id: organisationId,
        event_type: e.eventType,
        metric: e.metric ?? {},
      })),
    );
  }
}
