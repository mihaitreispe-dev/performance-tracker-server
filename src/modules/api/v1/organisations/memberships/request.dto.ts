import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ClientType, OrganisationRole } from 'src/database/interfaces';

export class InviteMemberDto {
  @ApiProperty({ description: 'Email of the user to invite. Must already have an account.' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: OrganisationRole, description: 'Role to grant in this organisation' })
  @IsEnum(OrganisationRole)
  role: OrganisationRole;

  @ApiPropertyOptional({
    description:
      'Optional personal note (max 500 chars) shown to the invitee alongside the pending invitation.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  invitationMessage?: string;

  @ApiPropertyOptional({
    enum: ClientType,
    description:
      "Only meaningful when role=athlete. 'general' (default) for one-to-many content consumers, 'athlete' for one-to-one coaching clients. The matching per-org default module profile is applied at invite time.",
  })
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;
}

export class UpdateMembershipRoleDto {
  @ApiProperty({ enum: OrganisationRole })
  @IsEnum(OrganisationRole)
  role: OrganisationRole;
}

export class MembershipIdParams {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsUUID()
  membershipId: string;
}
