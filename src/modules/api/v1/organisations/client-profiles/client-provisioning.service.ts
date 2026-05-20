import { Injectable, Logger } from '@nestjs/common';

import { ClientType, NewAthleteModuleOverride } from 'src/database/interfaces';
import { ModuleRepository } from 'src/repositories/module.repository';

/**
 * Applies an organisation's per-client-type default module profile when a new
 * athlete is provisioned. The flow is:
 *
 *   1. Load the org-wide module settings (or fall back to the catalogue's
 *      default_enabled flag for modules with no override).
 *   2. Load the per-client-type defaults for the target type.
 *   3. For each module where the per-type default differs from the org-wide
 *      setting, write an `athlete_module_overrides` row so the difference
 *      sticks even if the org-wide default changes later.
 *
 * Called from both the JWT-authed invite path (MembershipsApiService) and the
 * API-key path (PublicClientsService). Idempotency lives at the table: if an
 * override already exists we leave it alone (this can happen if a client is
 * re-provisioned via /clients — though we only call this on the first create).
 *
 * Errors are logged but never thrown: the membership is already committed at
 * this point, and the user's "modules they can see" can be reconciled later
 * via the admin UI. We prefer a degraded experience over a 500.
 */
@Injectable()
export class ClientProvisioningService {
  private readonly logger = new Logger(ClientProvisioningService.name);

  constructor(private readonly moduleRepo: ModuleRepository) {}

  async applyClientTypeDefaults(opts: {
    organisationId: string;
    athleteUserId: string;
    clientType: ClientType;
  }): Promise<void> {
    const { organisationId, athleteUserId, clientType } = opts;
    try {
      const [catalogue, orgSettings, typeDefaults] = await Promise.all([
        this.moduleRepo.listModules(),
        this.moduleRepo.listOrgSettings(organisationId),
        this.moduleRepo.listClientTypeDefaultsFor(organisationId, clientType),
      ]);

      // org-wide enabled snapshot, indexed by module key
      const orgEnabledByKey = new Map<string, boolean>();
      for (const m of catalogue) orgEnabledByKey.set(m.key, m.default_enabled);
      for (const s of orgSettings) orgEnabledByKey.set(s.module_key, s.enabled);

      // Only write override rows where the per-type default actually differs
      // from the org-wide value. Writing matching rows would be redundant and
      // would make later org-wide flips silently no-op on this athlete.
      const toInsert: NewAthleteModuleOverride[] = [];
      for (const d of typeDefaults) {
        const orgEnabled = orgEnabledByKey.get(d.module_key);
        if (orgEnabled === undefined) continue; // unknown module — skip
        if (orgEnabled === d.enabled) continue; // matches org default — no-op
        toInsert.push({
          organisation_id: organisationId,
          athlete_user_id: athleteUserId,
          module_key: d.module_key,
          enabled: d.enabled,
        });
      }

      if (toInsert.length > 0) {
        await this.moduleRepo.insertAthleteOverrides(toInsert);
      }
    } catch (err) {
      this.logger.error(
        `Failed to apply client-type defaults for athlete=${athleteUserId} org=${organisationId} clientType=${clientType}: ${(err as Error).message}`,
      );
    }
  }
}
