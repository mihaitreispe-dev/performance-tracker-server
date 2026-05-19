import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PublicListMeta } from '../response.dto';

export class PublicClientMembershipDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  role: string;

  @ApiPropertyOptional({ nullable: true })
  acceptedAt: string | null;
}

export class PublicClientDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'External per-(user, org) profile data.',
  })
  metadata: Record<string, unknown>;

  @ApiProperty({
    description:
      'True when the user was provisioned via API and has not yet claimed their account through the hosted auth flow.',
  })
  pendingClaim: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ type: PublicClientMembershipDTO })
  membership: PublicClientMembershipDTO;
}

export class PublicClientResponse {
  @ApiProperty({ type: PublicClientDTO })
  data: PublicClientDTO;
}

export class PublicClientListResponse {
  @ApiProperty({ type: [PublicClientDTO] })
  data: PublicClientDTO[];

  @ApiProperty({ type: PublicListMeta })
  meta: PublicListMeta;
}
