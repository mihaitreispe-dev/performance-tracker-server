import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ClientType } from 'src/database/interfaces';

/**
 * A single module's effective state for a client-type profile.
 *
 *   - `orgDefault` is the org-wide setting (or the catalogue default if the
 *     org hasn't overridden it).
 *   - `enabled` is the per-type override, or falls back to `orgDefault`.
 *   - `hasOverride` lets the UI render "inherits" vs "overridden" badges.
 */
export class ClientTypeModuleStateDTO {
  @ApiProperty() moduleKey: string;
  @ApiProperty() moduleName: string;
  @ApiProperty() enabled: boolean;
  @ApiProperty() orgDefault: boolean;
  @ApiProperty() hasOverride: boolean;
}

export class ClientTypeProfileDTO {
  @ApiProperty({ enum: ClientType }) clientType: ClientType;
  @ApiProperty({ type: [ClientTypeModuleStateDTO] }) modules: ClientTypeModuleStateDTO[];
}

export class ClientTypeProfileResponse {
  @ApiProperty({ type: ClientTypeProfileDTO }) data: ClientTypeProfileDTO;
}

export class ClientTypeProfilesListResponse {
  @ApiProperty({ type: [ClientTypeProfileDTO] }) data: ClientTypeProfileDTO[];
}

export class ClientTypeParam {
  @ApiPropertyOptional({ enum: ClientType }) clientType: ClientType;
}
