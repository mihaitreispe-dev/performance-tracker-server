import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsUUID } from 'class-validator';
import { OrganisationRole } from 'src/database/interfaces';

export class InviteMemberDto {
  @ApiProperty({ description: 'Email of the user to invite. Must already have an account.' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: OrganisationRole, description: 'Role to grant in this organisation' })
  @IsEnum(OrganisationRole)
  role: OrganisationRole;
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
