import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsString, MaxLength, ValidateNested } from 'class-validator';

/**
 * A single module toggle inside a client-type default profile.
 *
 *   - `moduleKey` matches `ModuleKey` (workouts, courses, …).
 *   - `enabled` is the per-type override; if it matches the org-wide setting
 *     the server treats it as a no-op (no override row written at provision).
 */
export class ClientTypeModuleToggleDto {
  @ApiProperty({ description: 'Module key from /v1/modules.' })
  @IsString()
  @MaxLength(64)
  moduleKey: string;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class UpdateClientTypeProfileDto {
  @ApiProperty({
    type: [ClientTypeModuleToggleDto],
    description:
      'Full set of module toggles for this client type. Modules omitted from the list are deleted from the per-type defaults (so they fall back to the org-wide setting).',
  })
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => ClientTypeModuleToggleDto)
  toggles: ClientTypeModuleToggleDto[];
}
