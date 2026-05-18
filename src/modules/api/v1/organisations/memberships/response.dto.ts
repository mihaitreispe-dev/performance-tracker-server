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
