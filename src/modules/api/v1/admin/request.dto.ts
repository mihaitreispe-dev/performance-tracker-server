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
