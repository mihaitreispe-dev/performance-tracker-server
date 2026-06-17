import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ImpersonateDto {
  @ApiProperty({ description: 'User id to impersonate.' })
  @IsUUID()
  userId: string;
}

export class AdminUserSearchQuery {
  @ApiPropertyOptional({
    description: 'Case-insensitive substring matched against email + display name + first/last name.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  q?: string;
}

export class AdminOrgIdParam {
  @ApiProperty({ description: 'Organisation id.' })
  @IsUUID()
  id: string;
}

export class AdminActivityQuery {
  @ApiPropertyOptional({ description: 'Range start (ISO). Default: 30 days ago.' })
  @IsString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Range end (ISO). Default: now.' })
  @IsString()
  @IsOptional()
  to?: string;
}
