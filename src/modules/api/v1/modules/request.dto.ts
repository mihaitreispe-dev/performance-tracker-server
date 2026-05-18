import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ModuleKey } from 'src/database/interfaces';

export class SetOrgModuleDto {
  @ApiProperty({ enum: ModuleKey })
  @IsEnum(ModuleKey)
  moduleKey: ModuleKey;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class SetAthleteOverrideDto {
  @ApiProperty()
  @IsUUID()
  athleteUserId: string;

  @ApiProperty({ enum: ModuleKey })
  @IsEnum(ModuleKey)
  moduleKey: ModuleKey;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;
}

export class ResolveModulesQuery {
  @ApiProperty({
    description: 'Athlete user id to resolve overrides for. Omit to get the org defaults only.',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  athleteId?: string;
}
