import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganisationRole } from 'src/database/interfaces';

export class MembershipDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  organisationId: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  userEmail: string;

  @ApiPropertyOptional({ nullable: true })
  userDisplayName: string | null;

  @ApiProperty({ enum: OrganisationRole })
  role: OrganisationRole;

  @ApiPropertyOptional({ nullable: true })
  invitedByUserId: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Personal note included by the inviter' })
  invitationMessage: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'External per-(user, org) profile data set by the integrating app.',
  })
  metadata: Record<string, unknown>;

  @ApiProperty()
  invitedAt: string;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt: string | null;
}

export class MembershipResponse {
  @ApiProperty({ type: MembershipDTO })
  data: MembershipDTO;
}

export class MembershipsListResponse {
  @ApiProperty({ type: [MembershipDTO] })
  data: MembershipDTO[];
}
